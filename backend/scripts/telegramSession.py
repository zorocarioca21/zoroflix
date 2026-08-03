import os
from pathlib import Path
from pyrogram import Client
from dotenv import load_dotenv

env_path = Path(__file__).parent.parent.parent / '.env'
load_dotenv(env_path)

API_ID = os.getenv("TELEGRAM_API_ID")
API_HASH = os.getenv("TELEGRAM_API_HASH")

if not API_ID or not API_HASH:
    print("API_ID ou API_HASH não encontrados no .env!")
    exit(1)

script_dir = Path(__file__).parent.resolve()
session_name = str(script_dir / "my_account")

print("Iniciando Login no Telegram via Pyrogram...")
app = Client(session_name, api_id=int(API_ID), api_hash=API_HASH)

with app:
    print("\n✅ Sucesso! Você está logado no Pyrogram.")
    print("O arquivo de sessão my_account.session foi salvo.")
    print("Agora você pode rodar o robô de download sem se preocupar com códigos!")
