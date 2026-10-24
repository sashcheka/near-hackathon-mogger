cmake_minimum_required(VERSION 3.24)

project(community_treasury_backend LANGUAGES CXX)

include(CTest)
include(FetchContent)

FetchContent_Declare(
    userver
    GIT_REPOSITORY https://github.com/userver-framework/userver.git
    GIT_TAG v3.2
    GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(userver)
userver_setup_environment()

add_executable(community_treasury_backend
    src/main.cpp
    src/handlers/products_handler.cpp
    src/handlers/orders_handler.cpp
    src/services/orders_service.cpp
    src/repositories/orders_repository.cpp
    src/repositories/products_repository.cpp
    src/clients/ollama_client.cpp
    src/handlers/purchase_handler.cpp
    src/services/purchase_service.cpp
    src/domain/order.cpp
)
target_compile_features(community_treasury_backend PRIVATE cxx_std_20)
target_link_libraries(community_treasury_backend PRIVATE userver::postgresql)

if(BUILD_TESTING)
    include("${userver_SOURCE_DIR}/cmake/UserverTestsuite.cmake")
    userver_testsuite_add(
        SERVICE_TARGET community_treasury_backend
        WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/tests"
        PYTEST_ARGS
            "--service-source-dir=${CMAKE_CURRENT_SOURCE_DIR}"
            "--service-config=${CMAKE_CURRENT_SOURCE_DIR}/configs/static_config.yaml"
            "--service-binary=${CMAKE_CURRENT_BINARY_DIR}/community_treasury_backend"
    )
endif()
