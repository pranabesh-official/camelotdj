from flask import Flask
from flask_socketio import SocketIO
app = Flask(__name__)
socketio = SocketIO(app)
@app.route("/")
def hello():
    return "Hello"
if __name__ == "__main__":
    print("Starting simple server...")
    socketio.run(app, port=5003)
