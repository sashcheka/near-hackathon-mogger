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
]


def check(base_url):
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
        print(f'{"PASS" if passed else "FAIL"}: {prompt} -> HTTP {status} {body}')
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
