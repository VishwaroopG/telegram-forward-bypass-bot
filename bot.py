import os
import re
import asyncio

# Fix for newer Python versions (like Python 3.14 on Render)
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

from pyrogram import Client, filters
from dotenv import load_dotenv
from flask import Flask
from threading import Thread

# Load environment variables
load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
API_ID = os.getenv("API_ID")
API_HASH = os.getenv("API_HASH")
ALLOWED_USERS_ENV = os.getenv("ALLOWED_USERS", "")

if not BOT_TOKEN or not API_ID or not API_HASH:
    print("Please set BOT_TOKEN, API_ID, and API_HASH in your .env file.")
    exit(1)

# Parse allowed users (can be usernames or user IDs separated by comma)
allowed_users = []
if ALLOWED_USERS_ENV:
    for u in ALLOWED_USERS_ENV.split(","):
        u = u.strip()
        if u.isdigit():
            allowed_users.append(int(u))
        else:
            allowed_users.append(u.replace("@", ""))
            
# Create a filter for allowed users
if allowed_users:
    auth_filter = filters.user(allowed_users)
else:
    auth_filter = filters.all # If no one is specified, allow everyone for now

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

LINK_PATTERN = r"(?:https?://)?(?:t\.me|telegram\.me)/(?P<chat_id>[a-zA-Z0-9_]+)/(?P<message_id>\d+)"

@app.on_message(filters.private & filters.command("start") & auth_filter)
async def start_cmd(client, message):
    await message.reply_text(
        "👋 **Welcome to the Forward Bypass Bot!**\n\n"
        "I can help you extract text, images, or videos from restricted public groups.\n\n"
        "🔗 **How to use me:**\n"
        "Simply paste a link to a message from a **public** Telegram group/channel "
        "(e.g., `https://t.me/groupname/1234`), and I'll fetch it for you immediately."
    )

@app.on_message(filters.private & filters.text & filters.regex(LINK_PATTERN) & auth_filter)
async def handle_link(client, message):
    match = re.search(LINK_PATTERN, message.text)
    if not match:
        return
    
    chat_id = match.group("chat_id")
    message_id = int(match.group("message_id"))
    
    status_msg = await message.reply_text("⏳ Fetching your message...")
    
    try:
        await client.copy_message(
            chat_id=message.chat.id,
            from_chat_id=chat_id,
            message_id=message_id
        )
        await status_msg.delete()
    except Exception as e:
        print(f"Error fetching message: {e}")
        await status_msg.edit_text(f"❌ **Failed to fetch the message.**\nMake sure the group is public and the link is correct.\n\n`Error: {e}`")

@app.on_message(filters.private & ~auth_filter)
async def unauthorized(client, message):
    await message.reply_text("⛔️ **Unauthorized Access**\nYou do not have permission to use this bot.")

if __name__ == "__main__":
    print("Bot is starting...")
    app.run()
