import java.util.EmptyStackException;

public class Stack<T> {
    private Node<T> top;

    // Node class for linked list
    private static class Node<T> {
        T data;
        Node<T> next;
        
        Node(T data) {
            this.data = data;
        }
    }

    // Push item onto stack
    public void push(T item) {
        Node<T> node = new Node<>(item);
        node.next = top;
        top = node;
    }

    // Pop item from stack
    public T pop() {
        if (isEmpty()) {
            throw new EmptyStackException();
        }
        T item = top.data;
        top = top.next;
        return item;
    }

    // Peek top item
    public T peek() {
        if (isEmpty()) {
            throw new EmptyStackException();
        }
        return top.data;
    }

    // Check if stack is empty
    public boolean isEmpty() {
        return top == null;
    }

    // Example usage
    public static void main(String[] args) {
        Stack<Integer> stack = new Stack<>();

        stack.push(10);
        stack.push(20);
        stack.push(30);

        System.out.println("Top: " + stack.peek()); // 30
        System.out.println("Popped: " + stack.pop()); // 30
        System.out.println("Popped: " + stack.pop()); // 20
        System.out.println("Is empty? " + stack.isEmpty()); // false
        System.out.println("Popped: " + stack.pop()); // 10
        System.out.println("Is empty? " + stack.isEmpty()); // true

        // Uncommenting below line will throw EmptyStackException
        // System.out.println(stack.pop());
    }
}
