# Speech-to-Text Transcription Service
# This script uses the Vosk engine to transcribe audio files into WebVTT subtitle format.
# It is designed to be called as a sub-process by the main Node.js worker.

import sys
import wave
import json
from vosk import Model, KaldiRecognizer

def format_timestamp(seconds):
    """
    Converts a raw numeric second value into a WEBVTT-compliant timestamp string (HH:MM:SS.mmm).
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    msecs = int((seconds % 1) * 1000)
    # Return the zero-padded formatted string.
    return f"{hours:02}:{minutes:02}:{secs:02}.{msecs:03}"

def transcribe(audio_path, output_path):
    """
    The main transcription logic: loads the model, processes audio frames, and writes the subtitle file.
    """
    # Define the path to the pre-trained Vosk model (stored in the 'model' directory).
    model_path = "model"
    model = Model(model_path)
    
    # Open the input WAV file. Vosk requires specific audio parameters for accurate recognition.
    wf = wave.open(audio_path, "rb")
    
    # Validate the WAV format (must be 16-bit mono PCM).
    if wf.getnchannels() != 1 or wf.getsampwidth() != 2 or wf.getcomptype() != "NONE":
        print("Audio file must be WAV format mono PCM.")
        sys.exit(1)

    # Initialize the Kaldi recognizer with the model and the audio's sample rate.
    rec = KaldiRecognizer(model, wf.getframerate())
    # Enable per-word timestamping for precise subtitle alignment.
    rec.SetWords(True)

    results = []
    # Read the audio file in small frames (4000 samples at a time).
    while True:
        data = wf.readframes(4000)
        # If we've reached the end of the file, break the loop.
        if len(data) == 0:
            break
        # Process the frame. If the recognizer finds a complete sentence/phrase, store the result.
        if rec.AcceptWaveform(data):
            results.append(json.loads(rec.Result()))
    
    # Capture the final remaining part of the audio.
    results.append(json.loads(rec.FinalResult()))

    # Start writing the output file in WEBVTT (Web Video Text Tracks) format.
    with open(output_path, "w") as f:
        f.write("WEBVTT\n\n")
        
        counter = 1
        # Iterate through the recognized phrases.
        for res in results:
            # Skip empty results.
            if "result" not in res:
                continue
            
            words = res["result"]
            if not words:
                continue
            
            # Group individual words into reasonable subtitle lines (chunks).
            # Here we group every 8 words together to keep the screen uncluttered.
            chunk_size = 8
            for i in range(0, len(words), chunk_size):
                chunk = words[i:i + chunk_size]
                # Extract the start time of the first word and the end time of the last word in the chunk.
                start = format_timestamp(chunk[0]["start"])
                end = format_timestamp(chunk[-1]["end"])
                # Join the words with spaces to form the subtitle text.
                text = " ".join([w["word"] for w in chunk])
                
                # Write the subtitle block: Index, Timestamp range, and Text.
                f.write(f"{counter}\n")
                f.write(f"{start} --> {end}\n")
                f.write(f"{text}\n\n")
                counter += 1

if __name__ == "__main__":
    # Ensure the script is called with both input and output paths.
    if len(sys.argv) < 3:
        print("Usage: transcribe.py <audio_path> <output_path>")
        sys.exit(1)
    
    # Start the transcription process.
    transcribe(sys.argv[1], sys.argv[2])
