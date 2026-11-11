"""Original, deterministic wind bed; no downloaded or shared audio is modified."""
from pathlib import Path
import array, math, random, subprocess, wave
root=Path(__file__).resolve().parents[1]
destination=root/'Resources/Generated/Audio/FOREST.caf'
if not destination.exists() or destination.stat().st_mtime<Path(__file__).stat().st_mtime:
    work=root/'build/atmosphere';work.mkdir(parents=True,exist_ok=True)
    destination.parent.mkdir(parents=True,exist_ok=True)
    rng=random.Random(413);rate=32000;duration=24;low=0.;samples=array.array('h')
    for i in range(rate*duration):
        t=i/rate;low+=.025*(rng.uniform(-1,1)-low)
        # Gusts separated by actual quiet; zero at the loop boundary.
        gust=max(0,math.sin(t*math.pi/12))**2
        boundary=min(1,t/2,(duration-t)/2)
        value=(low*2.8+.018*math.sin(t*math.tau*43))*gust*boundary
        samples.append(round(max(-1,min(1,value))*32767))
    source=work/'forest.wav'
    with wave.open(str(source),'wb') as wav:
        wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(rate);wav.writeframes(samples.tobytes())
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(source),'-c:a','alac',str(destination)],check=True)
