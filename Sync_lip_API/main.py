import os
import base64
import threading
import queue
import uuid
import json
import numpy as np
import cv2
import torch

from fastapi import FastAPI, UploadFile, WebSocket, WebSocketDisconnect, File
from fastapi.middleware.cors import CORSMiddleware

from os import listdir, path
import numpy as np
import cv2, os
import json
from omegaconf import OmegaConf
from pathlib import Path
from utils.inference import load_model

from utils.inference import inference

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

inference_config = OmegaConf.load("config.yaml")
checkpoint_path = str(Path(__file__).parents[0].joinpath("checkpoints/wav2lip_gan.pth"))
model = load_model(checkpoint_path)

sessions = {}
@app.post("/upload_image")
async def upload_image(image: UploadFile = File(...), audio: UploadFile = File(...)):
    session_id = str(uuid.uuid4())
    os.makedirs("uploads", exist_ok=True)
    image_path = f"uploads/{session_id}_{image.filename}"
    audio_path =  f"uploads/{session_id}_{audio.filename}"
    with open(image_path, "wb") as f:
        f.write(await image.read())
    with open(audio_path, "wb") as f:
        f.write(await audio.read())
    sessions[session_id] = {"upload_status": True, "image_path":image_path, "audio_path": audio_path}
    return {"status": "success", "session_id": session_id}

@app.websocket("/ws/lipsync/{session_id}")
async def websocket_lipsync(websocket: WebSocket, session_id: str):
    await websocket.accept()
    if session_id not in sessions or not sessions[session_id]['upload_status']:
        await websocket.close()
        return
    try:
        result_queue = queue.Queue()
        audio_queue = queue.Queue()
        
        stop_event = threading.Event()
        audio_path = str(Path(__file__).parents[0].joinpath(sessions[session_id]['audio_path']))
        image_path = str(Path(__file__).parents[0].joinpath(sessions[session_id]['image_path']))
        inference_thread = threading.Thread(target= inference,args=(stop_event,
                                                                    model,
                                                                    audio_path,
                                                                    image_path,
                                                                    result_queue,
                                                                    audio_queue 
                                                                    ),daemon=True)
        
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if (msg['request'] == "sync-lip"):
                inference_thread.start()
                print("inference thread start")
                stop_event.clear()
            while not stop_event.is_set():
                if not result_queue.empty():
                    frame_res = result_queue.get(block=1)
                    # audio_res = audio_queue.get(block=1)
                    await websocket.send_text(json.dumps({'frame':frame_res})) #'audio_chunk':audio_res
                if stop_event.is_set():
                    await websocket.send_text(json.dumps({'sync_lip_done':True})) #'audio_chunk':audio_res
            
    except WebSocketDisconnect:
        await websocket.close()
        stop_event.set()
        # audio_thread.join(timeout=1)
        # infer_thread.join(timeout=1)
    except Exception as e:
        stop_event.set()
        print(e)
        # audio_thread.join(timeout=1)
        # infer_thread.join(timeout=1)
        await websocket.close()