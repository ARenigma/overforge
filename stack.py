class Stack:
    """
    A simple Stack implementation with push, pop, peek, and isEmpty methods.
    """
    
    def __init__(self):
        """Initialize an empty stack."""
        self.items = []
    
    def push(self, item):
        """
        Add an item to the top of the stack.
        
        Args:
            item: The item to add to the stack
        """
        self.items.append(item)
    
    def pop(self):
        """
        Remove and return the top item from the stack.
        
        Returns:
            The top item from the stack
            
        Raises:
            IndexError: If the stack is empty
        """
        if self.isEmpty():
            raise IndexError("Cannot pop from an empty stack")
        return self.items.pop()
    
    def peek(self):
        """
        Return the top item from the stack without removing it.
        
        Returns:
            The top item from the stack
            
        Raises:
            IndexError: If the stack is empty
        """
        if self.isEmpty():
            raise IndexError("Cannot peek at an empty stack")
        return self.items[-1]
    
    def isEmpty(self):
        """
        Check if the stack is empty.
        
        Returns:
            True if the stack is empty, False otherwise
        """
        return len(self.items) == 0
    
    def size(self):
        """
        Return the number of items in the stack.
        
        Returns:
            The size of the stack
        """
        return len(self.items)
    
    def __str__(self):
        """Return a string representation of the stack."""
        return f"Stack({self.items})"


# Example usage and testing
if __name__ == "__main__":
    # Create a new stack
    stack = Stack()
    
    # Test isEmpty
    print(f"Is stack empty? {stack.isEmpty()}")  # True
    
    # Test push
    stack.push(1)
    stack.push(2)
    stack.push(3)
    print(f"Stack after pushing 1, 2, 3: {stack}")
    
    # Test peek
    print(f"Top element (peek): {stack.peek()}")  # 3
    
    # Test isEmpty after pushing
    print(f"Is stack empty? {stack.isEmpty()}")  # False
    
    # Test pop
    print(f"Popped: {stack.pop()}")  # 3
    print(f"Popped: {stack.pop()}")  # 2
    print(f"Stack after popping: {stack}")
    
    # Test peek again
    print(f"Top element (peek): {stack.peek()}")  # 1
    
    # Test error handling
    stack.pop()  # Remove last item
    try:
        stack.pop()  # Should raise IndexError
    except IndexError as e:
        print(f"Error caught: {e}")
    
    try:
        stack.peek()  # Should raise IndexError
    except IndexError as e:
        print(f"Error caught: {e}")
