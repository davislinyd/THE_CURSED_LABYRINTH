import Metal
import RealityKit
import simd
import os

/// The renderer owns immutable Metal resources; the callback receives a locked settings snapshot.
final class InkPostprocess:@unchecked Sendable {
    // Masks are immutable after upload and retained until the GPU callback has encoded them.
    private struct Mask:@unchecked Sendable {let texture:any MTLTexture}
    private struct Settings:Sendable {
        var camera=matrix_identity_float4x4
        var time:Float=0
        var impact:Float=0
        var third:Float=0
        var reduced:Float=0
        var world=SIMD4<Float>(1,1,0,0)
        var dimensions=SIMD2<Int>(0,0)
        var mask:Mask?
    }
    private struct Uniforms {var inverseProjection:simd_float4x4;var camera:simd_float4x4;var parameters:SIMD4<Float>;var world:SIMD4<Float>}
    private let settings=OSAllocatedUnfairLock(initialState:Settings())
    private let device:(any MTLDevice)?
    private let pipeline:(any MTLComputePipelineState)?
    private let fallback:(any MTLTexture)?
    init(){
        let d=MTLCreateSystemDefaultDevice();device=d
        if let d,let url=Bundle.main.url(forResource:"Woodblock",withExtension:"metal",subdirectory:"Shaders"),let source=try? String(contentsOf:url,encoding:.utf8){
            do {let library=try d.makeLibrary(source:source,options:nil);pipeline=try library.makeFunction(name:"woodblock").map{try d.makeComputePipelineState(function:$0)}}
            catch{pipeline=nil;print("Woodblock shader failed: \(error)")}
        }else{pipeline=nil}
        let descriptor=MTLTextureDescriptor.texture2DDescriptor(pixelFormat:.r8Unorm,width:1,height:1,mipmapped:false);descriptor.storageMode = .shared;descriptor.usage = .shaderRead
        fallback=d?.makeTexture(descriptor:descriptor)
        var white:UInt8=255;fallback?.replace(region:MTLRegionMake2D(0,0,1,1),mipmapLevel:0,withBytes:&white,bytesPerRow:1)
    }
    var impact:Float {get{settings.withLock{$0.impact}}set{settings.withLock{$0.impact=newValue}}}
    var diagnostics:(active:Bool,width:Int,height:Int){let dimensions=settings.withLock{$0.dimensions};return(pipeline != nil,dimensions.x,dimensions.y)}
    func update(camera:simd_float4x4,thirdPerson:Bool,reduced:Bool,time:Float){
        settings.withLock{$0.camera=camera;$0.third=thirdPerson ? 1:0;$0.reduced=reduced ? 1:0;$0.time=time;$0.impact*=0.9}
    }
    @MainActor func updateFog(_ world:GameWorld){
        let grid=world.grid
        let descriptor=MTLTextureDescriptor.texture2DDescriptor(pixelFormat:.r8Unorm,width:grid.width,height:grid.height,mipmapped:false)
        descriptor.storageMode = .shared;descriptor.usage = .shaderRead
        guard let mask=device?.makeTexture(descriptor:descriptor)else{return}
        var pixels=[UInt8](repeating:0,count:grid.width*grid.height)
        for y in 0..<grid.height {for x in 0..<grid.width {pixels[y*grid.width+x]=world.save.visited.contains(grid.key(x,y)) ? 255:0}}
        pixels.withUnsafeBytes{mask.replace(region:MTLRegionMake2D(0,0,grid.width,grid.height),mipmapLevel:0,withBytes:$0.baseAddress!,bytesPerRow:grid.width)}
        let next=Mask(texture:mask),size=SIMD4<Float>(Float(grid.width)*grid.cell,Float(grid.height)*grid.cell,world.save.area == .boss ? 0:1,0)
        settings.withLock{$0.mask=next;$0.world=size}
    }
    func render(_ context:ARView.PostProcessContext){
        guard let pipeline else {
            if let blit=context.commandBuffer.makeBlitCommandEncoder(){blit.copy(from:context.sourceColorTexture,to:context.targetColorTexture);blit.endEncoding()};return
        }
        let state=settings.withLock{$0}
        let dimensions=SIMD2(context.targetColorTexture.width,context.targetColorTexture.height)
        if state.dimensions != dimensions{settings.withLock{$0.dimensions=dimensions}}
        guard let encoder=context.commandBuffer.makeComputeCommandEncoder()else{return}
        var uniforms=Uniforms(inverseProjection:context.projection.inverse,camera:state.camera,parameters:SIMD4(state.time,state.impact,state.third,state.reduced),world:state.world)
        encoder.setComputePipelineState(pipeline)
        encoder.setTexture(context.sourceColorTexture,index:0);encoder.setTexture(context.sourceDepthTexture,index:1);encoder.setTexture(context.targetColorTexture,index:2);encoder.setTexture(state.mask?.texture ?? fallback,index:3)
        encoder.setBytes(&uniforms,length:MemoryLayout<Uniforms>.stride,index:0)
        let width=pipeline.threadExecutionWidth,height=max(1,pipeline.maxTotalThreadsPerThreadgroup/width)
        encoder.dispatchThreads(MTLSize(width:context.targetColorTexture.width,height:context.targetColorTexture.height,depth:1),threadsPerThreadgroup:MTLSize(width:width,height:height,depth:1));encoder.endEncoding()
    }
}
