public class FibonacciGenerator {
    public static int[] generateFibonacci(int n) {
        if (n <= 0) return new int[0];
        if (n == 1) return new int[]{0};

        int[] fib = new int[n];
        fib[0] = 0;
        fib[1] = 1;

        for (int i = 2; i < n; i++) {
            fib[i] = fib[i - 1] + fib[i - 2];
        }

        return fib;
    }

    // Example usage
    public static void main(String[] args) {
        int[] result = generateFibonacci(10);
        for (int num : result) {
            System.out.print(num + " ");
        }
    }
}
