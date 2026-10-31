"""Siapkan frontend untuk Tauri: bangun viewer/SMA_Viewer.html lalu salin ke desktop/app/dist/index.html."""
import pathlib, shutil, subprocess, sys
root = pathlib.Path(__file__).resolve().parents[3]
subprocess.check_call([sys.executable, str(root / 'viewer' / 'build.py')])
dist = root / 'desktop' / 'app' / 'dist'
dist.mkdir(parents=True, exist_ok=True)
shutil.copyfile(root / 'viewer' / 'SMA_Viewer.html', dist / 'index.html')
print('frontend siap:', dist / 'index.html')
