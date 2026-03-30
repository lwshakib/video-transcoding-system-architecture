import sys
import wave
import json
from vosk import Model, KaldiRecognizer

def format_timestamp(seconds):
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    msecs = int((seconds % 1) * 1000)
    return f"{hours:02}:{minutes:02}:{secs:02}.{msecs:03}"

def transcribe(audio_path, output_path):
    model_path = "model"
    model = Model(model_path)
    
    wf = wave.open(audio_path, "rb")
    if wf.getnchannels() != 1 or wf.getsampwidth() != 2 or wf.getcomptype() != "NONE":
        print("Audio file must be WAV format mono PCM.")
        sys.exit(1)

    rec = KaldiRecognizer(model, wf.getframerate())
    rec.SetWords(True)

    results = []
    while True:
        data = wf.readframes(4000)
        if len(data) == 0:
            break
        if rec.AcceptWaveform(data):
            results.append(json.loads(rec.Result()))
    
    results.append(json.loads(rec.FinalResult()))

    with open(output_path, "w") as f:
        f.write("WEBVTT\n\n")
        
        counter = 1
        for res in results:
            if "result" not in res:
                continue
            
            words = res["result"]
            if not words:
                continue
            
            # Group words into reasonable chunks for subtitles
            chunk_size = 8
            for i in range(0, len(words), chunk_size):
                chunk = words[i:i + chunk_size]
                start = format_timestamp(chunk[0]["start"])
                end = format_timestamp(chunk[-1]["end"])
                text = " ".join([w["word"] for w in chunk])
                
                f.write(f"{counter}\n")
                f.write(f"{start} --> {end}\n")
                f.write(f"{text}\n\n")
                counter += 1

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: transcribe.py <audio_path> <output_path>")
        sys.exit(1)
    
    transcribe(sys.argv[1], sys.argv[2])
