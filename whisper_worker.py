import sys
import json
import numpy as np
import warnings
import base64
from faster_whisper import WhisperModel

warnings.filterwarnings("ignore")

def main():
    try:
        model = WhisperModel("small", device="cpu", compute_type="int8")
        print("Model loaded!", file=sys.stderr)
        
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue

            try:
                raw_audio = base64.b64decode(line)
                
                if len(raw_audio) == 0:
                    print(json.dumps({"text": ""}))
                    sys.stdout.flush()
                    continue

                audio_int16 = np.frombuffer(raw_audio, dtype=np.int16)
                audio_float32 = audio_int16.astype(np.float32) / 32768.0

                segments, _ = model.transcribe(
                    audio_float32, 
                    beam_size=1,
                    temperature=0.0,
                    vad_filter=True
                )
                text = " ".join([segment.text for segment in segments])
                
                print(json.dumps({"text": text.strip()}))
                sys.stdout.flush()
            except Exception as e:
                print(json.dumps({"text": ""}))
                sys.stdout.flush()

    except Exception:
        pass

if __name__ == "__main__":
    main()
