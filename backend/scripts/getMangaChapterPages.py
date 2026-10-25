import os
import sys
import json
import zipfile
from pathlib import Path
from pyrogram import Client
from dotenv import load_dotenv

env_path = Path(__file__).parent.parent.parent / '.env'
load_dotenv(env_path)

API_ID = os.getenv("TELEGRAM_API_ID")
API_HASH = os.getenv("TELEGRAM_API_HASH")
MANGA_CHANNEL_ID_STR = os.getenv("TELEGRAM_MANGA_CHANNEL_ID")

if not API_ID or not API_HASH or not MANGA_CHANNEL_ID_STR:
    sys.exit(1)

CHANNEL_ID = int(MANGA_CHANNEL_ID_STR)

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Uso: getMangaChapterPages.py <message_id> <cache_dir>"}))
        sys.exit(1)
        
    message_id = int(sys.argv[1])
    cache_dir = sys.argv[2]
    
    os.makedirs(cache_dir, exist_ok=True)
    chapter_cache_dir = os.path.join(cache_dir, f"ch_msg_{message_id}")
    
    # Se já foi extraído no cache local, retorna direto
    if os.path.exists(chapter_cache_dir):
        files = sorted([f for f in os.listdir(chapter_cache_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))])
        if len(files) > 0:
            print(json.dumps({"pages": files, "dir": chapter_cache_dir}))
            sys.exit(0)

    # Caso não esteja em cache, baixa do Telegram
    script_dir = Path(__file__).parent.resolve()
    session_name = str(script_dir / "my_account")
    
    app = Client(session_name, api_id=int(API_ID), api_hash=API_HASH)
    
    with app:
        msg = app.get_messages(CHANNEL_ID, message_ids=message_id)
        if not msg or not msg.document:
            print(json.dumps({"error": "Mensagem ou documento não encontrado no Telegram"}))
            sys.exit(1)
            
        temp_cbz_path = os.path.join(cache_dir, f"temp_{message_id}.cbz")
        app.download_media(msg, file_name=temp_cbz_path)
        
        os.makedirs(chapter_cache_dir, exist_ok=True)
        with zipfile.ZipFile(temp_cbz_path, 'r') as z:
            z.extractall(chapter_cache_dir)
            
        try:
            if os.path.exists(temp_cbz_path):
                os.remove(temp_cbz_path)
        except:
            pass
            
        files = sorted([f for f in os.listdir(chapter_cache_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))])
        
        # Gerenciamento de Espaço LRU: mantém no máximo 25 capítulos mais recentes em disco
        try:
            MAX_CACHED_CHAPTERS = 25
            cached_dirs = [os.path.join(cache_dir, d) for d in os.listdir(cache_dir) if d.startswith('ch_msg_') and os.path.isdir(os.path.join(cache_dir, d))]
            if len(cached_dirs) > MAX_CACHED_CHAPTERS:
                cached_dirs.sort(key=lambda d: os.path.getmtime(d)) # Mais antigos primeiro
                to_remove = cached_dirs[:len(cached_dirs) - MAX_CACHED_CHAPTERS]
                for old_dir in to_remove:
                    import shutil
                    shutil.rmtree(old_dir, ignore_errors=True)
        except Exception:
            pass

        print(json.dumps({"pages": files, "dir": chapter_cache_dir}))

if __name__ == "__main__":
    main()
