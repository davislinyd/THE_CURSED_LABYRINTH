import Foundation
import RealityKit
import UIKit
import simd

struct ArtRange:Decodable {var offset:Int;var count:Int}
struct ArtGeometry:Decodable {var positions:ArtRange;var normals:ArtRange;var uv:ArtRange;var indices:ArtRange}
struct ArtMaterial:Decodable {
    var color:[Float];var roughness:Float;var metallic:Float;var emission:[Float];var unlit:Bool
    var opacity:Float;var transparent:Bool;var alphaTest:Float;var doubleSided:Bool;var backSide:Bool?
    var map:String?;var normal:String?;var arm:String?;var uvScale:[Float];var uvOffset:[Float];var flipY:Bool
}
struct ArtDraw:Decodable {var geometry:Int;var material:Int}
struct ArtNode:Decodable {
    var name:String;var parent:Int;var position:[Float];var rotation:[Float];var scale:[Float];var draws:[ArtDraw];var billboard:Bool
    var transform:Transform {Transform(scale:SIMD3(scale[0],scale[1],scale[2]),rotation:simd_quatf(ix:rotation[0],iy:rotation[1],iz:rotation[2],r:rotation[3]),translation:SIMD3(position[0],position[1],position[2]))}
}
struct ArtTrack:Decodable {var node:Int;var property:String;var times:[Float];var values:[Float]}
struct ArtClip:Decodable {var duration:Float;var loop:Bool;var tracks:[ArtTrack]}
struct ArtFile:Decodable {var schema:Int;var name:String;var geometries:[ArtGeometry];var materials:[ArtMaterial];var nodes:[ArtNode];var animations:[String:ArtClip];var triangles:Int}

@MainActor final class NativeArtLibrary {
    let directory:URL
    private var templates:[String:(ArtFile,Entity)]=[:]
    private var textures:[String:TextureResource]=[:]
    init(directory:URL){self.directory=directory}
    func instance(_ name:String) throws -> NativeActor {
        let (file,root)=try template(name)
        return NativeActor(file:file,root:root.clone(recursive:true))
    }
    func scene(_ name:String)throws->Entity {try template(name).1.clone(recursive:true)}
    func preload(_ names:[String]) async throws {
        for name in names {_ = try template(name);await Task.yield()}
    }
    private func template(_ name:String)throws->(ArtFile,Entity) {
        if let cached=templates[name]{return cached}
        let file=try JSONDecoder().decode(ArtFile.self,from:Data(contentsOf:directory.appendingPathComponent(name+".json")))
        guard file.schema==1 else{throw CocoaError(.coderReadCorrupt)}
        let bytes=try Data(contentsOf:directory.appendingPathComponent(name+".bin"),options:.mappedIfSafe)
        func array<T>(_ range:ArtRange,_ type:T.Type)->[T] {
            precondition(range.offset>=0 && range.offset+range.count*MemoryLayout<T>.stride<=bytes.count)
            return bytes.withUnsafeBytes{raw in (0..<range.count).map{raw.loadUnaligned(fromByteOffset:range.offset+$0*MemoryLayout<T>.stride,as:T.self)}}
        }
        var meshes:[String:MeshResource]=[:]
        let mats=try file.materials.map{try material($0)}
        let container=Entity();container.name=name
        var entities:[Entity]=[]
        for (i,node) in file.nodes.enumerated() {
            let entity=Entity();entity.name="art_\(i)_"+node.name;entity.transform=node.transform
            if node.billboard {entity.components.set(BillboardComponent())}
            for draw in node.draws {
                let key="\(draw.geometry):\(draw.material)"
                let mesh:MeshResource
                if let cached=meshes[key]{mesh=cached}else{
                    let g=file.geometries[draw.geometry],m=file.materials[draw.material]
                    let p=array(g.positions,Float.self),n=array(g.normals,Float.self),uv=array(g.uv,Float.self)
                    guard p.count%3==0,n.count==p.count,uv.count==p.count/3*2 else{throw CocoaError(.coderReadCorrupt)}
                    var descriptor=MeshDescriptor(name:key)
                    descriptor.positions=MeshBuffers.Positions(stride(from:0,to:p.count,by:3).map{SIMD3(p[$0],p[$0+1],p[$0+2])})
                    descriptor.normals=MeshBuffers.Normals(stride(from:0,to:n.count,by:3).map{SIMD3(n[$0],n[$0+1],n[$0+2])})
                    descriptor.textureCoordinates=MeshBuffers.TextureCoordinates(stride(from:0,to:uv.count,by:2).map{idx in
                        let u=uv[idx]*m.uvScale[0]+m.uvOffset[0],v=uv[idx+1]*m.uvScale[1]+m.uvOffset[1]
                        return SIMD2(u,m.flipY ? 1-v:v)
                    })
                    descriptor.primitives = .triangles(array(g.indices,UInt32.self))
                    mesh=try MeshResource.generate(from:[descriptor]);meshes[key]=mesh
                }
                entity.addChild(ModelEntity(mesh:mesh,materials:[mats[draw.material]]))
            }
            if node.parent>=0 {entities[node.parent].addChild(entity)}else{container.addChild(entity)}
            entities.append(entity)
        }
        templates[name]=(file,container);return(file,container)
    }
    private func texture(_ name:String?,normal:Bool=false)throws->TextureResource? {
        guard let name else{return nil}
        let key=name+(normal ? ":n":"")
        if let cached=textures[key]{return cached}
        let value=try TextureResource.load(contentsOf:directory.appendingPathComponent(name),options:.init(semantic:normal ? .normal:.color))
        textures[key]=value;return value
    }
    private func color(_ c:[Float])->UIColor {
        func srgb(_ x:Float)->CGFloat {CGFloat(x<=0.0031308 ? x*12.92:1.055*pow(max(0,x),1/2.4)-0.055)}
        return UIColor(red:srgb(c[0]),green:srgb(c[1]),blue:srgb(c[2]),alpha:1)
    }
    private func material(_ m:ArtMaterial)throws->any RealityKit.Material {
        let tex=try texture(m.map)
        if m.unlit {
            var value=UnlitMaterial(color:color(m.color));value.color.texture=tex.map{.init($0)}
            if m.transparent {value.blending = .transparent(opacity:.init(floatLiteral:m.opacity))}
            value.faceCulling=m.doubleSided ? .none:m.backSide==true ? .front:.back;return value
        }
        var value=PhysicallyBasedMaterial();value.baseColor.tint=color(m.color);value.baseColor.texture=tex.map{.init($0)}
        value.roughness = .init(floatLiteral:m.roughness);value.metallic = .init(floatLiteral:m.metallic)
        if let normal=try texture(m.normal,normal:true){value.normal.texture = .init(normal)}
        if m.emission.contains(where:{$0>0}){value.emissiveColor.color=color(m.emission.map{min(1,$0)});value.emissiveIntensity=max(1,m.emission.max() ?? 1)}
        if m.transparent || m.alphaTest>0 {value.blending = .transparent(opacity:.init(floatLiteral:m.opacity))}
        value.faceCulling=m.doubleSided ? .none:m.backSide==true ? .front:.back
        return value
    }
}

@MainActor final class NativeActor {
    let root:Entity
    let file:ArtFile
    private var nodes:[Entity]=[]
    private var transforms:[Transform]=[]
    private var previous:[Transform]=[]
    private var current=""
    private var elapsed:Float=0
    private var blend:Float=1
    private var lastTick=0
    private var motions:Set<Int>=[]
    private var flashRemaining:Float=0
    private var surfaces:[(ModelEntity,[any RealityKit.Material])]=[]
    private(set) var blade:Entity?
    init(file:ArtFile,root:Entity){
        self.file=file;self.root=root
        for (i,n) in file.nodes.enumerated(){
            let entity=root.findEntity(named:"art_\(i)_"+n.name)!
            nodes.append(entity);transforms.append(n.transform)
            if n.name=="katana_blade"{blade=entity}
        }
        for clip in file.animations.values {motions.formUnion(clip.tracks.map(\.node))}
        previous=transforms
        func collect(_ entity:Entity){if let model=entity as? ModelEntity,let component=model.model{surfaces.append((model,component.materials))};entity.children.forEach(collect)}
        collect(root)
    }
    func flash(){
        flashRemaining=0.065
        for (model,_) in surfaces {model.model?.materials=[UnlitMaterial(color:UIColor(red:1,green:0.9,blue:0.72,alpha:1))]}
    }
    func animate(_ name:String,tick:Int,delta:Float,speed:Float=1){
        if flashRemaining>0 {flashRemaining-=delta;if flashRemaining<=0 {for(model,materials)in surfaces{model.model?.materials=materials}}}
        guard let clip=file.animations[name] ?? file.animations["idle"] else{return}
        if name != current || tick<lastTick {
            previous=nodes.map(\.transform);current=name;elapsed=0;blend=current.hasPrefix("atk") || current=="counter" ? 0.06:0.16
        }
        lastTick=tick;elapsed+=delta
        let sample=clip.loop ? elapsed*speed:name=="die" ? elapsed:Float(tick)/60
        let time=clip.loop ? sample.truncatingRemainder(dividingBy:max(0.01,clip.duration)):min(sample,clip.duration)
        for node in motions{transforms[node]=file.nodes[node].transform}
        for track in clip.tracks {
            let t=track.times;guard !t.isEmpty else{continue}
            var low=0,high=t.count-1
            while low<high {let mid=(low+high+1)/2;if t[mid]<=time{low=mid}else{high=mid-1}}
            let a=low,b=min(t.count-1,a+1),weight=t[b]>t[a] ? clamp((time-t[a])/(t[b]-t[a]),0,1):0
            let values=track.values,n=track.node
            if track.property=="quaternion" {
                let x=a*4,y=b*4
                let qa=simd_quatf(ix:values[x],iy:values[x+1],iz:values[x+2],r:values[x+3]),qb=simd_quatf(ix:values[y],iy:values[y+1],iz:values[y+2],r:values[y+3])
                transforms[n].rotation=simd_slerp(qa,qb,weight)
            }else{
                let x=a*3,y=b*3,va=SIMD3(values[x],values[x+1],values[x+2]),vb=SIMD3(values[y],values[y+1],values[y+2]),v=va+(vb-va)*weight
                if track.property=="scale"{transforms[n].scale=v}else{transforms[n].translation=v}
            }
        }
        let mix=clamp(elapsed/blend,0,1),smooth=mix*mix*(3-2*mix)
        for i in motions {
            var transform=transforms[i]
            if mix<1 {
                transform.rotation=simd_slerp(previous[i].rotation,transform.rotation,smooth)
                transform.translation=previous[i].translation+(transform.translation-previous[i].translation)*smooth
                transform.scale=previous[i].scale+(transform.scale-previous[i].scale)*smooth
            }
            nodes[i].transform=transform
        }
    }
}
