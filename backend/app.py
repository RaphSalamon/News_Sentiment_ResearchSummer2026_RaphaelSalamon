from flask import Flask #import statements
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/')
def home():
    return 'News Sentiment API is running' # message displays when you paste link into the browser

if __name__ == '__main__':
    app.run(debug=True)