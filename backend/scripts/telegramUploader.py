import os
import sys
import time
import requests
import re
from pathlib import Path
from dotenv import load_dotenv
from pyrogram import Client
from pyrogram.types import Message

# Carrega variáveis do .env localizado na raiz do projeto (duas pastas acima)
env_path = Path(__file__).parent.parent.parent / '.env'
load_dotenv(env_path)

API_ID = os.getenv("TELEGRAM_API_ID")
API_HASH = os.getenv("TELEGRAM_API_HASH")
CHANNEL_ID_STR = os.getenv("TELEGRAM_CHANNEL_ID")

if not API_ID or not API_HASH or not CHANNEL_ID_STR:
    print("Faltam variáveis no .env (TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_CHANNEL_ID)")
    sys.exit(1)

CHANNEL_ID = int(CHANNEL_ID_STR)

def search_m3u(file_path, query):
    results = []
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            for i, line in enumerate(lines):
                if line.startswith('#EXTINF'):
                    match = re.search(r',(.+)', line)
                    if match:
                        title = match.group(1).strip()
                        if query.lower() in title.lower():
                            if i + 1 < len(lines):
                                url = lines[i+1].strip()
                                if url.startswith('http'):
                                    results.append({'title': title, 'url': url})
    except Exception as e:
        print(f"Erro lendo M3U: {e}")
    return results

def download_file(url, dest_path):
    print(f"Baixando IPTV -> {url} ...")
    headers = {
        "User-Agent": "VLC/3.0.18 LibVLC/3.0.18"
    }
    with requests.get(url, headers=headers, stream=True) as r:
        r.raise_for_status()
        total_length = r.headers.get('content-length')
        
        with open(dest_path, 'wb') as f:
            if total_length is None:
                f.write(r.content)
            else:
                dl = 0
                total_length = int(total_length)
                for data in r.iter_content(chunk_size=1024*1024):
                    dl += len(data)
                    f.write(data)
                    done = int(100 * dl / total_length)
                    sys.stdout.write(f"\rDownload progresso: {done}% ({dl/(1024*1024):.2f} MB)")
                    sys.stdout.flush()
    print("\nDownload concluído!")

def progress(current, total):
    print(f"\rUpload progresso: {current * 100 / total:.2f}%", end="")

def main():
    if len(sys.argv) < 2:
        print("Uso: python3 telegramUploader.py \"Nome do Filme\"")
        sys.exit(1)
        
    search_term = sys.argv[1]
    
    script_dir = Path(__file__).parent.resolve()
    m3u_path = script_dir.parent.parent / 'iptv_list.m3u'
    
    if not m3u_path.exists():
        print(f"Arquivo {m3u_path} não encontrado!")
        sys.exit(1)
        
    print(f"Buscando por '{search_term}'...")
    results = search_m3u(m3u_path, search_term)
    
    if not results:
        print("Nenhum filme encontrado.")
        sys.exit(0)
        
    for idx, r in enumerate(results):
        print(f"[{idx}] {r['title']}")
        
    choice = input(f"\nDigite o número para baixar (0 a {len(results)-1}): ")
    try:
        choice = int(choice)
        selected = results[choice]
    except (ValueError, IndexError):
        print("Escolha inválida.")
        sys.exit(1)
        
    print(f"Você escolheu: {selected['title']}")
    
    safe_title = re.sub(r'[^a-z0-9]', '_', selected['title'].lower())
    ext = selected['url'].split('?')[0].split('.')[-1]
    if ext not in ['mp4', 'mkv', 'ts']:
        ext = 'mp4'
        
    tmp_file = f"/tmp/{safe_title}.{ext}"
    
    try:
        # 1. Download
        download_file(selected['url'], tmp_file)
        
        # 2. Upload Pyrogram
        print("Iniciando Upload para o Telegram via Pyrogram/tgcrypto...")
        
        # Cria a sessão 'my_account' na pasta atual do script (para salvar o cache do pyrogram)
        session_name = str(script_dir / "my_account")
        
        # Configurando max_concurrent_transmissions no Pyrogram não tem parametro direto na client call, 
        # a biblioteca já otimiza internamente se tgcrypto estiver instalado.
        app = Client(session_name, api_id=int(API_ID), api_hash=API_HASH)
        
        with app:
            app.send_video(
                chat_id=CHANNEL_ID,
                video=tmp_file,
                caption=f"**{selected['title']}**\nUpload via Zoroflix Bot (Python Turbo)",
                supports_streaming=True, # Magia pra criar o Player
                progress=progress
            )
        
        print("\nUpload concluído com sucesso!")
        
        # 3. Limpeza
        if os.path.exists(tmp_file):
            os.remove(tmp_file)
            print("Lixo removido do servidor!")
            
    except Exception as e:
        print(f"\nErro: {e}")

if __name__ == "__main__":
    main()
