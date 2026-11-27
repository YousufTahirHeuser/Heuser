import os
import time
import html
import json
import urllib.request
import urllib.error
from flask import Flask, send_from_directory, request, jsonify

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# -----------------------------------------------------------------------------
# In-Memory Cache for Open Trivia DB (protects against rate limits: ~1 req/5s)
# -----------------------------------------------------------------------------
questions_cache = {}        # key: (category, difficulty) -> (timestamp, data)
categories_cache = {"timestamp": 0, "data": None}
CACHE_TTL = 300             # 5 minutes in seconds
CATEGORIES_TTL = 3600       # 1 hour in seconds

# -----------------------------------------------------------------------------
# Home Routes
# -----------------------------------------------------------------------------
@app.route("/")
def home():
    return send_from_directory(os.path.join(BASE_DIR, "home"), "index.html")

@app.route("/home/<path:filename>")
def home_static(filename):
    return send_from_directory(os.path.join(BASE_DIR, "home"), filename)

# -----------------------------------------------------------------------------
# Game Routes (Homework 6)
# -----------------------------------------------------------------------------
@app.route("/game")
@app.route("/game/")
def game():
    return send_from_directory(os.path.join(BASE_DIR, "game"), "index.html")

@app.route("/game/<path:filename>")
def game_static(filename):
    return send_from_directory(os.path.join(BASE_DIR, "game"), filename)

# -----------------------------------------------------------------------------
# Portfolio Routes (Homework 8)
# -----------------------------------------------------------------------------
@app.route("/portfolio")
@app.route("/portfolio/")
def portfolio():
    return send_from_directory(os.path.join(BASE_DIR, "portfolio"), "index.html")

@app.route("/portfolio/<path:filename>")
def portfolio_static(filename):
    return send_from_directory(os.path.join(BASE_DIR, "portfolio"), filename)

# -----------------------------------------------------------------------------
# Embedded Routes (Homework 10)
# -----------------------------------------------------------------------------
@app.route("/embedded")
@app.route("/embedded/")
def embedded():
    return send_from_directory(os.path.join(BASE_DIR, "embedded"), "index.html")

@app.route("/embedded/<path:filename>")
def embedded_static(filename):
    return send_from_directory(os.path.join(BASE_DIR, "embedded"), filename)

# -----------------------------------------------------------------------------
# API Page & Endpoints (Open Trivia Database Quiz Machine)
# -----------------------------------------------------------------------------
@app.route("/api")
@app.route("/api/")
def api_page():
    return send_from_directory(os.path.join(BASE_DIR, "api"), "index.html")

@app.route("/api/categories")
def api_categories():
    now = time.time()
    if categories_cache["data"] and (now - categories_cache["timestamp"] < CATEGORIES_TTL):
        return jsonify(categories_cache["data"])

    try:
        req = urllib.request.Request(
            "https://opentdb.com/api_category.php",
            headers={"User-Agent": "HeuserTriviaArcade/1.0"}
        )
        with urllib.request.urlopen(req, timeout=8) as response:
            raw = response.read().decode("utf-8")
            data = json.loads(raw)
            categories_cache["timestamp"] = now
            categories_cache["data"] = data
            return jsonify(data)
    except Exception as e:
        # If cache exists even if expired, return it as fallback
        if categories_cache["data"]:
            return jsonify(categories_cache["data"])
        return jsonify({
            "status": "error",
            "message": "Unable to fetch trivia categories. Please try again."
        }), 503

@app.route("/api/questions")
def api_questions():
    category = request.args.get("category", "").strip()
    difficulty = request.args.get("difficulty", "").strip().lower()

    cache_key = (category, difficulty)
    now = time.time()

    # 1. Return fresh cached response if available
    if cache_key in questions_cache:
        cached_time, cached_data = questions_cache[cache_key]
        if now - cached_time < CACHE_TTL:
            return jsonify({"status": "success", "results": cached_data, "cached": True})

    # 2. Build Open Trivia DB query URL
    # Always request 10 questions of multiple choice type
    url = "https://opentdb.com/api.php?amount=10"
    if category.isdigit():
        url += f"&category={category}"
    if difficulty in ["easy", "medium", "hard"]:
        url += f"&difficulty={difficulty}"

    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "HeuserTriviaArcade/1.0"}
        )
        with urllib.request.urlopen(req, timeout=9) as response:
            raw = response.read().decode("utf-8")
            data = json.loads(raw)

        response_code = data.get("response_code", -1)

        # Handle Open Trivia DB Response Codes
        if response_code == 0:
            # Code 0: Success -> Decode HTML entities
            raw_results = data.get("results", [])
            clean_results = []
            for item in raw_results:
                clean_results.append({
                    "category": html.unescape(item.get("category", "")),
                    "type": item.get("type", "multiple"),
                    "difficulty": item.get("difficulty", "medium"),
                    "question": html.unescape(item.get("question", "")),
                    "correct_answer": html.unescape(item.get("correct_answer", "")),
                    "incorrect_answers": [html.unescape(a) for a in item.get("incorrect_answers", [])]
                })

            # Save in memory cache
            questions_cache[cache_key] = (now, clean_results)
            return jsonify({"status": "success", "results": clean_results, "cached": False})

        elif response_code == 1:
            # Code 1: No Results
            return jsonify({
                "status": "error",
                "code": 1,
                "message": "No trivia questions found for this selection. Try 'Any Category' or another difficulty."
            }), 200

        elif response_code == 5:
            # Code 5: Rate limit (Too Many Requests)
            # If we have an expired cache entry, serve it gracefully
            if cache_key in questions_cache:
                _, fallback_data = questions_cache[cache_key]
                return jsonify({"status": "success", "results": fallback_data, "cached": True})
            return jsonify({
                "status": "error",
                "code": 5,
                "message": "Open Trivia DB rate limit reached. Please wait a few seconds and click Retry."
            }), 429

        else:
            return jsonify({
                "status": "error",
                "code": response_code,
                "message": "The trivia database returned a temporary error. Please try again."
            }), 502

    except urllib.error.HTTPError as e:
        if e.code == 429 and cache_key in questions_cache:
            _, fallback_data = questions_cache[cache_key]
            return jsonify({"status": "success", "results": fallback_data, "cached": True})
        return jsonify({
            "status": "error",
            "message": "The arcade machine is out of order. Check your internet and try again"
        }), 503

    except Exception as e:
        # If cache exists from earlier, serve it
        if cache_key in questions_cache:
            _, fallback_data = questions_cache[cache_key]
            return jsonify({"status": "success", "results": fallback_data, "cached": True})
        return jsonify({
            "status": "error",
            "message": "The arcade machine is out of order. Check your internet and try again"
        }), 503

@app.route("/api/<path:filename>")
def api_static(filename):
    return send_from_directory(os.path.join(BASE_DIR, "api"), filename)

# -----------------------------------------------------------------------------
# Server Entry Point (Compatible with Render & Local Testing)
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
