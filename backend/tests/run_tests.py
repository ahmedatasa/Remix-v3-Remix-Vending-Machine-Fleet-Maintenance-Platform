import sys
import os

# Ensure backend root is in PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.tests.test_backend import run_all_unit_tests

if __name__ == "__main__":
    result = run_all_unit_tests()
    if result:
        print("\nAll Backend Phase 3 tests passed successfully!")
        sys.exit(0)
    else:
        print("\nSome tests failed!")
        sys.exit(1)
