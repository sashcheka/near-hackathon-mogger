"""Check real model selection through the running backend using unpaid orders."""

import argparse
import json
import sys
import urllib.error
import urllib.request


NEAR = 10 ** 24
CASES = [
    ('Buy one pack of toilet paper', 3, 201,
     {'product_id': 'toilet-paper', 'quantity': 1}),
    ('Buy two packs of standard toilet paper', 5, 201,
     {'product_id': 'toilet-paper', 'quantity': 2}),
    ('Buy one pack of premium toilet paper', 50, 201,
     {'product_id': 'premium-paper', 'quantity': 1}),
    ('Buy one laptop', 3, 404, {'error': 'no_matching_product'}),
    ('Buy one carton of whole cow milk', 10, 201,
     {'product_id': 'milk-whole', 'quantity': 1}),
    ('Buy cow milk without lactose, not a plant-based drink', 10, 201,
     {'product_id': 'milk-lactose-free', 'quantity': 1}),
    ('Buy two cartons of unsweetened oat milk', 10, 201,
     {'product_id': 'oat-drink', 'quantity': 2}),
    ('Buy one carton of unsweetened almond milk', 10, 201,
     {'product_id': 'almond-drink', 'quantity': 1}),
    ('I grind coffee at home. Buy one bag of whole coffee beans', 10, 201,
     {'product_id': 'coffee-beans', 'quantity': 1}),
    ('Buy ground coffee with caffeine', 10, 201,
     {'product_id': 'coffee-ground', 'quantity': 1}),
    ('Buy ground coffee without caffeine', 10, 201,
     {'product_id': 'coffee-decaf', 'quantity': 1}),
    ('Buy two boxes of green tea', 10, 201,
     {'product_id': 'tea-green', 'quantity': 2}),
    ('Buy one box of black tea', 10, 201,
     {'product_id': 'tea-black', 'quantity': 1}),
    ('I wash plates by hand. Buy a bottle of dishwashing liquid', 10, 201,
     {'product_id': 'dish-soap', 'quantity': 1}),
    ('Buy liquid detergent for clothes in a washing machine', 10, 201,
     {'product_id': 'laundry-detergent', 'quantity': 1}),
    ('Buy three bottles of drinking water with bubbles', 10, 201,
     {'product_id': 'water-sparkling', 'quantity': 3}),
    ('Buy one bottle of drinking water without gas', 10, 201,
     {'product_id': 'water-still', 'quantity': 1}),
    ('Buy one loaf of whole wheat bread', 10, 201,
     {'product_id': 'bread-whole-wheat', 'quantity': 1}),
    ('Buy one loaf of bread without gluten', 10, 201,
     {'product_id': 'bread-gluten-free', 'quantity': 1}),
    ('Buy soy milk. Do not substitute another plant-based drink', 10, 404,
     {'error': 'no_matching_product'}),
]


def check(base_url):
    required_ids = {fields['product_id'] for _, _, _, fields in CASES
                    if 'product_id' in fields}
    with urllib.request.urlopen(base_url.rstrip('/') + '/products', timeout=10) as response:
        products = json.load(response)['products']
    missing = required_ids - {product['id'] for product in products}
    if missing:
        raise ValueError('Missing demo products: ' + ', '.join(sorted(missing)) +
                         '. Apply backend/db/seed.sql before this check.')

    failures = 0
    for prompt, budget, expected_status, expected_fields in CASES:
        request = urllib.request.Request(
            base_url.rstrip('/') + '/purchase-requests',
            data=json.dumps({
                'prompt': prompt, 'budget_yocto': str(budget * NEAR),
            }).encode(),
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        try:
            response = urllib.request.urlopen(request, timeout=90)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            status, body = response.status, json.load(response)
        passed = status == expected_status and all(
            body.get(key) == value for key, value in expected_fields.items()
        )
        if expected_status == 201:
            passed = passed and body.get('status') == 'pending_payment'
        failures += not passed
        selection = (f"{body['product_id']} x{body.get('quantity')}"
                     if 'product_id' in body else body.get('error', body))
        print(f'{"PASS" if passed else "FAIL"}: {prompt} -> HTTP {status}, {selection}')
        if not passed:
            print(f'  Expected: HTTP {expected_status}, {expected_fields}')
            print(f'  Received: {body}')
    print(f'Passed {len(CASES) - failures}/{len(CASES)} real-model checks.')
    return int(failures != 0)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backend-url', default='http://localhost:8080')
    args = parser.parse_args()
    try:
        sys.exit(check(args.backend_url))
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        print(f'Check failed: {error}', file=sys.stderr)
        sys.exit(1)
