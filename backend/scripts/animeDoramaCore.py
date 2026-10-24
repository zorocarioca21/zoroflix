import os
import sys
import re
import time
import json
import ssl
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

# Carrega variáveis do .env da raiz do zoroflix
ROOT_DIR = Path(__file__).resolve().parent.parent.parent
ENV_PATH = ROOT_DIR / '.env'

try:
    from dotenv import load_dotenv
    if ENV_PATH.exists():
        load_dotenv(ENV_PATH)
except ImportError:
    if ENV_PATH.exists():
        try:
            with open(ENV_PATH, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        v = v.strip().strip('"').strip("'")
                        os.environ.setdefault(k.strip(), v)
        except Exception:
            pass

VPS_URL = os.getenv('VPS_URL', 'https://cinegeek.shop')
HYBRID_API_KEY = os.getenv('API_KEY', 'cinegeek_hybrid_key_123')
TELEGRAM_API_ID = os.getenv('TELEGRAM_API_ID')
TELEGRAM_API_HASH = os.getenv('TELEGRAM_API_HASH')
TELEGRAM_SESSION = os.getenv('TELEGRAM_SESSION')
TELEGRAM_CHANNEL_ID = os.getenv('TELEGRAM_CHANNEL_ID', '-1003839496993')

if os.name == 'nt' and Path('D:/').exists():
    TEMP_DOWNLOAD_DIR = Path('D:/cinegeek downloads/animes_doramas')
else:
    TEMP_DOWNLOAD_DIR = ROOT_DIR / 'temp_animes_doramas'
TEMP_DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

STATE_FILE = ROOT_DIR / 'anime_dorama_state.json'

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

HEADERS_DEFAULT = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

def load_state():
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {'processed_urls': {}, 'current_sitemap': 1}

def save_state(state):
    try:
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(state, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[State] Erro ao salvar estado: {e}")

def fetch_sitemap_urls(sitemap_index):
    sitemap_url = f'https://meusanimes.blog/episodes-sitemap{sitemap_index}.xml'
    print(f"\n[Sitemap] 📑 Lendo sitemap {sitemap_index}: {sitemap_url}")
    req = urllib.request.Request(sitemap_url, headers=HEADERS_DEFAULT)
    try:
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=15) as res:
            root = ET.fromstring(res.read())
            urls = []
            for child in root:
                loc = child.find('{http://www.sitemaps.org/schemas/sitemap/0.9}loc')
                if loc is not None and loc.text:
                    u = loc.text.strip()
                    if '/e/' in u and not u.endswith('/e/'):
                        urls.append(u)
            return urls
    except Exception as e:
        print(f"[Sitemap] ⚠️ Erro ao obter sitemap {sitemap_index}: {e}")
        return []

def extract_episode_meta(page_url):
    req = urllib.request.Request(page_url, headers=HEADERS_DEFAULT)
    try:
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=12) as res:
            html = res.read().decode('utf-8', errors='ignore')
            
            # 1. Video params do player: serv01.meusdoramas.club/#/video/tmdb/season/episode/
            v_matches = re.findall(r'serv01\.meusdoramas\.club/#/video/(\d+)/(\d+)/(\d+)', html)
            if not v_matches:
                return None
            
            tmdb_id, season_num, ep_num = v_matches[0]
            
            # 2. Título da página
            title_match = re.search(r'<title>([^<]+)</title>', html)
            raw_title = title_match.group(1) if title_match else ''
            
            # Limpa: "Assistir ... Online - Meus Animes"
            clean_title = re.sub(r'^(?:Assistir\s+)', '', raw_title, flags=re.I)
            clean_title = re.sub(r'\s+(?:Online|Completo|HD|Grátis|Gratis).*$', '', clean_title, flags=re.I)
            clean_title = clean_title.replace(' - Meus Animes', '').strip()
            
            is_dublado = bool(re.search(r'\bdublado\b', page_url + ' ' + clean_title, re.I))
            if is_dublado and not re.search(r'\bdublado\b', clean_title, re.I):
                clean_title = f"{clean_title} Dublado"

            return {
                'page_url': page_url,
                'tmdb_id': tmdb_id,
                'season': int(season_num),
                'episode': int(ep_num),
                'title': clean_title,
                'is_dublado': is_dublado
            }
    except Exception as e:
        print(f"[Scraper] Erro ao carregar página {page_url}: {e}")
        return None

def resolve_video_stream(tmdb_id, season, episode):
    api_url = f'https://serv01.meusdoramas.club/posts/get-video.php?tmdb={tmdb_id}&season_number={season}&episode_number={episode}'
    req = urllib.request.Request(
        api_url,
        headers={
            'User-Agent': HEADERS_DEFAULT['User-Agent'],
            'Referer': 'https://serv01.meusdoramas.club/'
        }
    )
    try:
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=10) as res:
            data = json.loads(res.read().decode('utf-8'))
            if not data.get('success') or not data.get('videoUrl'):
                return None
            video_url = data['videoUrl']
            
            # Se for Blogger, extrai a URL final do GoogleVideo em MP4
            if 'blogger.com' in video_url:
                b_req = urllib.request.Request(
                    video_url,
                    headers={
                        'User-Agent': HEADERS_DEFAULT['User-Agent'],
                        'Referer': 'https://serv01.meusdoramas.club/'
                    }
                )
                with urllib.request.urlopen(b_req, context=SSL_CTX, timeout=10) as b_res:
                    b_html = b_res.read().decode('utf-8', errors='ignore')
                    formats = re.findall(r'\\&quot;itag\\&quot;:(\d+).*?\\&quot;url\\&quot;:\\&quot;(https:[^\\&]+.*?)\\&quot;', b_html)
                    if formats:
                        # Pega o itag com melhor qualidade disponível
                        best_url = formats[-1][1].replace('\\u0026', '&').replace('\\u003d', '=')
                        return {
                            'stream_url': best_url,
                            'headers': {
                                'User-Agent': HEADERS_DEFAULT['User-Agent'],
                                'Referer': 'https://www.blogger.com/',
                                'Origin': 'https://www.blogger.com'
                            }
                        }
            elif 'video.wixstatic.com' in video_url:
                return {
                    'stream_url': video_url,
                    'headers': HEADERS_DEFAULT
                }
    except Exception as e:
        print(f"[StreamResolver] Erro ao resolver stream TMDb {tmdb_id} S{season}E{episode}: {e}")
    return None

import subprocess

def detect_video_quality(video_path):
    """Detecta altura do vídeo via ffprobe e retorna a tag (4K, FHD, HD, SD)"""
    try:
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=height',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            str(video_path)
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
        output = res.stdout.strip()
        height = int(output) if output.isdigit() else 0
        
        if height >= 2000:
            return '4K', height
        elif height >= 1000:
            return 'FHD', height
        elif height >= 700:
            return 'HD', height
        elif height > 0:
            return 'SD', height
    except Exception as e:
        print(f"[ffprobe] ⚠️ Erro ao verificar resolução: {e}")
    return '', 0

def format_title_with_quality(title, quality_tag):
    """Limpa tags antigas de qualidade e anexa a correta detectada via ffprobe"""
    quality_regex = r'\s*[\[\(]?\s*(4K|UHD|2160p|FHD|1080p|FULLHD|FULL HD|HD|720p|SD|480p|360p)\s*[\]\)]?\s*'
    cleaned = re.sub(quality_regex, ' ', title, flags=re.I)
    cleaned = re.sub(r'\s{2,}', ' ', cleaned).strip()
    if quality_tag:
        cleaned = f"{cleaned} {quality_tag}"
    return cleaned

def report_hybrid_progress(title, status, progress, task_id='ANIME_WORKER'):
    """Envia o progresso em tempo real para a VPS transmitir ao painel via WebSocket"""
    try:
        url = f"{VPS_URL}/api/hybrid/progress"
        payload = {
            'workerId': 'ANIME_WORKER',
            'taskId': task_id,
            'title': title,
            'status': status,
            'progress': round(float(progress), 1)
        }
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': HEADERS_DEFAULT['User-Agent'],
                'Content-Type': 'application/json',
                'x-api-key': HYBRID_API_KEY
            },
            data=json.dumps(payload).encode('utf-8')
        )
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=5):
            pass
    except Exception:
        pass

def clear_hybrid_progress():
    """Remove o status do worker de animes da tela do painel quando ocioso"""
    try:
        url = f"{VPS_URL}/api/hybrid/clear-status"
        payload = {'workerId': 'ANIME_WORKER'}
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': HEADERS_DEFAULT['User-Agent'],
                'Content-Type': 'application/json',
                'x-api-key': HYBRID_API_KEY
            },
            data=json.dumps(payload).encode('utf-8')
        )
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=5):
            pass
    except Exception:
        pass

def is_worker_paused():
    """Verifica se o usuário pausou o worker pelo botão no painel admin"""
    try:
        url = f"{VPS_URL}/api/hybrid/anime-worker/status"
        req = urllib.request.Request(
            url,
            headers={
                'User-Agent': HEADERS_DEFAULT['User-Agent'],
                'x-api-key': HYBRID_API_KEY
            }
        )
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=5) as res:
            data = json.loads(res.read().decode('utf-8'))
            return bool(data.get('paused'))
    except Exception:
        return False

def download_video_file(stream_info, output_path, title):
    stream_url = stream_info['stream_url']
    headers = stream_info['headers']
    req = urllib.request.Request(stream_url, headers=headers)
    
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=30) as res:
        total_size = int(res.headers.get('Content-Length') or 0)
        downloaded = 0
        last_print = 0
        last_report = 0
        
        with open(output_path, 'wb') as f:
            while True:
                chunk = res.read(1024 * 512) # 512KB chunks
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                
                now = time.time()
                pct = (downloaded / total_size * 100) if total_size > 0 else 0
                
                # Reporta para o terminal
                if now - last_print > 1 or downloaded == total_size:
                    last_print = now
                    mb_cur = downloaded / (1024 * 1024)
                    mb_tot = total_size / (1024 * 1024)
                    sys.stdout.write(f"\r[⬇️ Download] {title[:35]} | {pct:.1f}% ({mb_cur:.1f}/{mb_tot:.1f} MB)")
                    sys.stdout.flush()
                
                # Reporta para a VPS / Painel Web em tempo real a cada 2.5s
                if now - last_report > 2.5 or downloaded == total_size:
                    last_report = now
                    report_hybrid_progress(title, 'Baixando_Anime', pct)

    sys.stdout.write('\n')
    return downloaded

def register_on_vps(meta, telegram_message_id, file_size):
    url = f"{VPS_URL}/api/hybrid/insert-custom"
    payload = {
        'title': meta['title'],
        'url': meta['page_url'],
        'telegram_message_id': telegram_message_id,
        'file_size': file_size,
        'tmdb_id': meta['tmdb_id'],
        'media_type': 'tv',
        'season_number': meta['season'],
        'episode_number': meta['episode']
    }
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': HEADERS_DEFAULT['User-Agent'],
            'Content-Type': 'application/json',
            'x-api-key': HYBRID_API_KEY
        },
        data=json.dumps(payload).encode('utf-8')
    )
    try:
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=10) as res:
            resp = json.loads(res.read().decode('utf-8'))
            return resp.get('success')
    except Exception as e:
        print(f"[VPS Register] ⚠️ Erro ao registrar na VPS: {e}")
        return False
