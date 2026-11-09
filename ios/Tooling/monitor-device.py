"""Read-only evidence collection for an already launched --validate Debug app."""
import argparse, datetime, json, subprocess, time
from pathlib import Path
from zoneinfo import ZoneInfo

p=argparse.ArgumentParser()
p.add_argument('--device',required=True)
p.add_argument('--build',required=True)
p.add_argument('--seconds',type=float,default=1200)
args=p.parse_args()
root=Path(__file__).resolve().parents[1]
out=root/'build'/f'soak-{args.build}'
out.mkdir(parents=True,exist_ok=True)
started=time.monotonic()
failures=0
previous_seconds=-1
previous_area=None
previous_completions=0
fresh=time.monotonic()
history=[]
result={'passed':False,'build':args.build,'started':datetime.datetime.now(ZoneInfo('Asia/Taipei')).isoformat()}
def command(*extra):
    return subprocess.run(['xcrun','devicectl',*extra],capture_output=True,text=True,timeout=25)
while time.monotonic()-started<args.seconds+300:
    sample=out/'latest.json'
    response=command('device','copy','from','--device',args.device,'--domain-type','appDataContainer','--domain-identifier','com.davislinyd.thecursedlabyrinth','--source','Library/Application Support/Journey/metrics.json','--destination',str(sample))
    if response.returncode:
        failures+=1
        if failures>=3:result['failure']='Three consecutive device-copy failures';break
        time.sleep(15);continue
    failures=0
    data=json.loads(sample.read_text())
    if data['version']!=args.build:
        if time.monotonic()-started>60:result['failure']='Expected build never produced metrics';break
        time.sleep(15);continue
    elapsed=data['seconds']
    if elapsed<previous_seconds:result['failure']='App metrics restarted during continuous run';break
    if elapsed>previous_seconds:fresh=time.monotonic()
    if time.monotonic()-fresh>75:result['failure']='Gameplay metrics stopped advancing';break
    previous_seconds=elapsed
    stamp=int(elapsed)
    (out/f'metrics-{stamp:04}.json').write_text(json.dumps(data,indent=2))
    summary={'seconds':elapsed,'area':data['area'],'averageFPS':data['averageFPS'],'thermalState':data['thermalState'],'completions':data['validation'].get('completions',0)}
    history.append(summary)
    if data['area']!=previous_area or summary['completions']!=previous_completions:
        command('device','capture','screenshot','--device',args.device,'--destination',str(out/f'{stamp:04}-{data["area"]}.png'))
        previous_area=data['area'];previous_completions=summary['completions']
        print(json.dumps(summary),flush=True)
    if elapsed>=args.seconds:
        result['passed']=not data.get('assetFailures') and data.get('woodblockShader') is True and summary['completions']>0
        result['metrics']=data
        command('device','capture','screenshot','--device',args.device,'--destination',str(out/'final.png'))
        break
    time.sleep(15)
result['finished']=datetime.datetime.now(ZoneInfo('Asia/Taipei')).isoformat()
result['samples']=history
(out/'result.json').write_text(json.dumps(result,indent=2))
print(json.dumps({k:v for k,v in result.items() if k not in ['metrics','samples']}),flush=True)
raise SystemExit(0 if result['passed'] else 1)
