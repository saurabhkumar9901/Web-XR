#!/usr/bin/env python3
"""
Aura VR Video Converter Utility
Converts 3D Stereoscopic Side-by-Side (SBS) videos into 2D Monoscopic Equirectangular
format using FFmpeg, ready for seamless WebXR / Three.js streaming.
"""

import os
import sys
import subprocess
import shutil

def check_ffmpeg():
    """Verify that FFmpeg is installed and accessible on the system path."""
    if shutil.which("ffmpeg") is None:
        print("\n[Error] FFmpeg was not found on your system path!")
        print("This tool requires FFmpeg to perform high-performance video transcoding.")
        print("\n--- Installation Instructions ---")
        if sys.platform == "win32":
            print("Windows: Install via winget (Run PowerShell as Admin):")
            print("  winget install Gyan.FFmpeg")
            print("Or download from https://ffmpeg.org/download.html and add it to your System PATH.")
        elif sys.platform == "darwin":
            print("macOS: Install via Homebrew:")
            print("  brew install ffmpeg")
        else:
            print("Linux: Install via apt-get:")
            print("  sudo apt-get install ffmpeg")
        print("---------------------------------\n")
        return False
    return True

def run_conversion(input_path, output_path, format_type, resolution):
    """Construct and run the optimal FFmpeg command to crop and scale the video."""
    print(f"\n[Aura Converter] Initializing conversion...")
    print(f"  Input:  {input_path}")
    print(f"  Output: {output_path}")
    print(f"  Target: {resolution[0]}x{resolution[1]} (Standard 2:1 Monoscopic Equirectangular)")
    
    # ── FFmpeg Filter Graph ───────────────────────────────────────────────
    if format_type == "half_sbs" or format_type == "full_sbs":
        # Extract left half
        filter_graph = f"crop=w=iw/2:h=ih:x=0:y=0,scale={resolution[0]}:{resolution[1]}"
    elif format_type == "top_bottom":
        # Extract top half
        filter_graph = f"crop=w=iw:h=ih/2:x=0:y=0,scale={resolution[0]}:{resolution[1]}"
    elif format_type == "eac":
        # Convert YouTube EAC (Equi-Angular Cubemap) to Equirectangular
        filter_graph = f"v360=eac:e,scale={resolution[0]}:{resolution[1]}"
    else:
        # Already monoscopic equirectangular, just scale if necessary
        filter_graph = f"scale={resolution[0]}:{resolution[1]}"
    
    command = [
        "ffmpeg",
        "-y",               # Overwrite output file if it exists
        "-i", input_path,   # Input file path
        "-vf", filter_graph, # Video filter graph
        "-c:v", "libx265",  # High-efficiency HEVC video codec
        "-preset", "slow",  # Better compression efficiency
        "-crf", "18",       # Visually lossless constant rate factor
        "-b:v", "80M",      # High bitrate for 4K VR
        "-maxrate", "100M",
        "-bufsize", "200M",
        "-c:a", "aac",      # Convert audio to AAC for MP4 compatibility
        "-b:a", "320k",     # High quality audio bitrate
        "-movflags", "+faststart", # Optimize for web streaming
        output_path
    ]
    
    print("\n[Aura Converter] Executing FFmpeg command:")
    print("  " + " ".join(command))
    print("\n[Aura Converter] Transcoding started. Please do not close this window...\n")
    
    try:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
        while True:
            line = process.stdout.readline()
            if not line:
                break
            if "frame=" in line or "time=" in line:
                sys.stdout.write(f"\r  {line.strip()}")
                sys.stdout.flush()
            elif "Error" in line:
                print(f"\n  {line.strip()}")
                
        process.wait()
        print() 
        
        if process.returncode == 0:
            print(f"\n[Success] Video converted successfully!")
            print(f"Saved: {output_path}")
        else:
            print(f"\n[Error] FFmpeg process exited with code {process.returncode}.")
    except Exception as e:
        print(f"\n[Error] Failed to run conversion process: {e}")

import json

def get_video_dimensions(input_path):
    if shutil.which("ffprobe") is None:
        return None
    ffprobe_cmd = [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "json", input_path
    ]
    try:
        result = subprocess.run(ffprobe_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True, encoding='utf-8', errors='replace')
        data = json.loads(result.stdout)
        streams = data.get("streams", [])
        if streams:
            return int(streams[0].get("width", 0)), int(streams[0].get("height", 0))
    except Exception:
        pass
    return None

def main():
    print("=" * 60)
    print("       AURA XR WELLNESS - 3D TO 2D VR VIDEO CONVERTER")
    print("=" * 60)
    
    if not check_ffmpeg():
        sys.exit(1)
        
    input_path = input("\nEnter the path to your raw video file: ").strip().strip('"').strip("'")
    if not os.path.exists(input_path):
        print(f"[Error] File not found: {input_path}")
        sys.exit(1)

    print("\nHow does the raw video look if you play it in a normal video player (like VLC)?")
    print("  [1] Two identical images side-by-side (Half-SBS or Full-SBS)")
    print("  [2] Two identical images stacked top-and-bottom (Top-Bottom 3D)")
    print("  [3] One single image stretched out (Already Monoscopic 2D 360)")
    print("  [4] A weird grid of 6 squares (YouTube EAC format)")
    format_choice = input("Enter choice [1/2/3/4, default: 1]: ").strip()
    
    format_type = "half_sbs"
    if format_choice == "2":
        format_type = "top_bottom"
    elif format_choice == "3":
        format_type = "monoscopic"
    elif format_choice == "4":
        format_type = "eac"
    
    print("\nSelect the target 2:1 Monoscopic output resolution:")
    print("  [1] 4K High-Definition (3840x1920) - Recommended")
    print("  [2] 2K Compact-Size (1920x960)")
    res_choice = input("Enter choice [1/2, default: 1]: ").strip()
    resolution = (1920, 960) if res_choice == "2" else (3840, 1920)
    
    base, _ = os.path.splitext(input_path)
    output_path = f"{base}_monoscopic_2d_fixed.mp4"
    
    run_conversion(input_path, output_path, format_type, resolution)

if __name__ == "__main__":
    main()
