import requests
import base64
import pyscreenshot as ImageGrab
import os
import time
from pynput import keyboard, mouse
import openai

# Configuration
API_KEY_VISION = "YOUR_GOOGLE_VISION_API_KEY"
API_KEY_GPT4 = "YOUR_OPENAI_GPT_KEY"
VISION_API_URL = f"https://vision.googleapis.com/v1/images:annotate?key={API_KEY_VISION}"
openai.api_key = API_KEY_GPT4

text_file_path = f"response_{int(time.time())}.txt"
with open(text_file_path, 'w') as f:
    f.write("Responses:\n\n")

def append_to_text_file(text):
    with open(text_file_path, 'a', encoding='utf-8') as f:
        f.write(text + "\n\n")

def capture_screenshot(bbox=None):
    try:
        screenshot = ImageGrab.grab(bbox=bbox)
        return screenshot
    except Exception as e:
        print(f"Error taking screenshot: {e}")
        return None

def detect_text(screenshot):
    image_bytes = screenshot.tobytes('jpeg', 'RGB')
    encoded_image = base64.b64encode(image_bytes).decode("utf-8")

    body = {
        "requests": [
            {
                "image": {"content": encoded_image},
                "features": [{"type": "TEXT_DETECTION"}]
            }
        ]
    }

    response = requests.post(VISION_API_URL, json=body)
    response.raise_for_status()

    results = response.json().get("responses", [{}])[0].get("textAnnotations", [])
    detected_text = results[0]["description"] if results else ""
    return detected_text

def chat_with_gpt(saved_text):
    messages = [
        {"role": "system", "content": "You are tasked with answering a Cognitive Aptitude Test (CCAT) question that assesses problem-solving, comprehension, application of information, and critical thinking. Provide the best and most logical answer based on the given information."},
        {"role": "user", "content": saved_text},
    ]

    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=messages,
        max_tokens=2000
    )
    generated_text = response.choices[0].message['content'].strip()
    return generated_text

click_coords = []

def on_click(x, y, button, pressed):
    if pressed:
        if len(click_coords) == 2:
            click_coords.pop(0)  # Remove the oldest click
        click_coords.append((x, y))

def on_key_release(key):
    try:
        if key.char == 's' and len(click_coords) == 2:
            x1, y1 = click_coords[0]
            x2, y2 = click_coords[1]
            bbox = (x1, y1, x2, y2)
            screenshot = capture_screenshot(bbox)
            if screenshot:
                detected_text = detect_text(screenshot)
                print("Detected Text:", detected_text)
                gpt_response = chat_with_gpt(detected_text)
                print("GPT Response:", gpt_response)
                append_to_text_file(gpt_response)
        elif key.char == 'r':
            click_coords.clear()
    except AttributeError:
        pass

if __name__ == "__main__":
    mouse_listener = mouse.Listener(on_click=on_click)
    mouse_listener.start()

    with keyboard.Listener(on_release=on_key_release) as listener:
        listener.join()
