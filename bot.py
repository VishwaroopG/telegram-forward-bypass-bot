import os
import re
from pyrogram import Client, filters
from dotenv import load_dotenv
from flask import Flask
from threading import Thread

# Load environment variables
load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
API_ID = os.getenv("API_ID")
API_HASH = os.getenv("API_HASH")

if not BOT_TOKEN or not API_ID or not API_HASH:
    print("Please set BOT_TOKEN, API_ID, and API_HASH in your .env file.")
    print("You can get a BOT_TOKEN from https://t.me/BotFather")
    print("You can get an API_ID and API_HASH from https://my.telegram.org/apps")
    exit(1)

# --- Dummy Web Server for Render ---
web_app = Flask(__name__)

@web_app.route('/')
def home():
    return "Bot is running!"

def run_server():
    port = int(os.environ.get("PORT", 8080))
    web_app.run(host="0.0.0.0", port=port)

# Start the web server in a separate thread
Thread(target=run_server).start()
# -----------------------------------

# Initialize the Pyrogram client
app = Client(
    "forward_bypass_bot",
    api_id=API_ID,
    api_hash=API_HASH,
    bot_token=BOT_TOKEN
)

# Regex pattern to match Telegram public post links
# Matches: https://t.me/username/1234 or t.me/username/1234
LINK_PATTERN = r"(?:https?://)?(?:t\.me|telegram\.me)/(?P<chat_id>[a-zA-Z0-9_]+)/(?P<message_id>\d+)"

@app.on_message(filters.private & filters.text & filters.regex(LINK_PATTERN))
async def handle_link(client, message):
    match = re.search(LINK_PATTERN, message.text)
    if not match:
        return
    
    chat_id = match.group("chat_id")
    message_id = int(match.group("message_id"))
    
    status_msg = await message.reply_text("Fetching message...")
    
    try:
        # Pyrogram's copy_message is perfect for this as it sends a copy 
        # without the 'Forwarded from' header and bypasses forward restrictions
        await client.copy_message(
            chat_id=message.chat.id,
            from_chat_id=chat_id,
            message_id=message_id
        )
        await status_msg.delete()
    except Exception as e:
        print(f"Error fetching message: {e}")
        await status_msg.edit_text(f"Failed to fetch the message. Make sure the group is public and the link is correct.\n\nError: `{e}`")

@app.on_message(filters.private & filters.command("start"))
async def start_cmd(client, message):
    await message.reply_text(
        "Hello! 👋\n\n"
        "Send me a link to a message from a **public** Telegram group/channel "
        "(e.g., `https://t.me/groupname/1234`), and I will extract the content "
        "(text, image, video) and send it back to you, bypassing forward restrictions."
    )

if __name__ == "__main__":
    print("Bot is starting...")
    app.run()
