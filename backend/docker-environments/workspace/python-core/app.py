import time
from functools import wraps

def timing_decorator(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.perf_counter()   # high-resolution timer
        result = func(*args, **kwargs)
        end_time = time.perf_counter()
        elapsed = end_time - start_time
        print(f"⏱️ Function '{func.__name__}' executed in {elapsed:.6f} seconds")
        return result
    return wrapper

# Example usage
@timing_decorator
def slow_function():
    time.sleep(1.5)
    return "Done"

print(slow_function())
