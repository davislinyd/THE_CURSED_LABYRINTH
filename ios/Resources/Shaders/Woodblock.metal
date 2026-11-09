#include <metal_stdlib>
using namespace metal;
struct InkUniforms {float4x4 inverseProjection;float4x4 camera;float4 parameters;float4 world;};
float inkHash(float2 p){float3 q=fract(float3(p.x,p.y,p.x)*0.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float inkNoise(float2 p){float2 i=floor(p),f=fract(p);f=f*f*(3-2*f);return mix(mix(inkHash(i),inkHash(i+float2(1,0)),f.x),mix(inkHash(i+float2(0,1)),inkHash(i+1),f.x),f.y);}
float3 viewPosition(float2 uv,float d,constant InkUniforms &u){float4 p=u.inverseProjection*float4(uv.x*2-1,1-uv.y*2,d,1);return p.xyz/p.w;}
kernel void woodblock(texture2d<float,access::sample> source [[texture(0)]],
                      depth2d<float,access::sample> depth [[texture(1)]],
                      texture2d<float,access::write> target [[texture(2)]],
                      texture2d<float,access::sample> fog [[texture(3)]],
                      constant InkUniforms &u [[buffer(0)]],uint2 gid [[thread_position_in_grid]]){
    if(gid.x>=target.get_width()||gid.y>=target.get_height())return;
    constexpr sampler s(coord::normalized,address::clamp_to_edge,filter::linear);
    float2 size=float2(target.get_width(),target.get_height()),uv=(float2(gid)+0.5)/size,px=1/size;
    float3 c=source.sample(s,uv).rgb;
    float dc=abs(viewPosition(uv,depth.sample(s,uv),u).z);
    float dl=abs(viewPosition(uv-float2(px.x,0),depth.sample(s,uv-float2(px.x,0)),u).z);
    float dr=abs(viewPosition(uv+float2(px.x,0),depth.sample(s,uv+float2(px.x,0)),u).z);
    float du=abs(viewPosition(uv-float2(0,px.y),depth.sample(s,uv-float2(0,px.y)),u).z);
    float dd=abs(viewPosition(uv+float2(0,px.y),depth.sample(s,uv+float2(0,px.y)),u).z);
    float edge=smoothstep(0.16,0.5,(abs(dl+dr-2*dc)+abs(du+dd-2*dc))/(u.parameters.z>0.5 ? max(dc*0.06,0.4):1));
    c=mix(c,float3(0.026,0.022,0.028),edge*0.65);
    if(u.parameters.w<0.5){
        float3 halo=(source.sample(s,uv+float2(px.x*3,0)).rgb+source.sample(s,uv-float2(px.x*3,0)).rgb+source.sample(s,uv+float2(0,px.y*3)).rgb+source.sample(s,uv-float2(0,px.y*3)).rgb)*0.25;
        c+=max(float3(0),halo-0.65)*0.15;
    }
    float luminance=dot(c,float3(0.299,0.587,0.114)),red=clamp((c.r-max(c.g,c.b))*3,0.0,1.0);
    c=mix(float3(luminance),c,mix(0.75,1.0,red));
    c*=mix(float3(0.84,0.93,1.12),float3(1.08,1,0.86),smoothstep(0.1,0.8,luminance));
    float paper=inkNoise(uv*size*0.7)*0.65+inkNoise(uv*size*float2(0.3,0.02))*0.35;
    c*=1+(paper-0.5)*0.09;
    c=c*0.98+float3(0.012,0.010,0.009);
    float2 d=uv-0.5;float vignette=dot(d,d)*1.25;
    c*=1-vignette*0.42;
    if(u.world.z>0.5){
        float3 view=viewPosition(uv,depth.sample(s,uv),u),world=(u.camera*float4(view,1)).xyz;
        float explored=fog.sample(s,world.xz/u.world.xy).r;
        float drift=inkNoise(world.xz*0.45+u.parameters.x*float2(0.025,-0.018));
        float hidden=(1-smoothstep(0.18,0.85,explored))*(1-smoothstep(2.4,6.5,world.y));
        c=mix(c,float3(0.035,0.042,0.058)*(0.8+drift*0.5),hidden*0.94);
    }
    if(u.parameters.z>0.5){float mist=1-exp(-max(0.0,dc-6)*0.018);c=mix(c,float3(0.025,0.03,0.042),min(0.65,mist));}
    c=mix(c,c*float3(1.4,0.45,0.35),u.parameters.y*clamp(vignette*3,0.0,1.0));
    target.write(float4(max(float3(0),c),1),gid);
}
