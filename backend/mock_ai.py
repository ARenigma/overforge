from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.json
    # Always return a sample question for testing
    return jsonify({
        "question": "What is the time complexity of your solution?",
        "type": "complexity",
        "context": data.get("code", "")
    })

if __name__ == '__main__':
    app.run(port=8000)