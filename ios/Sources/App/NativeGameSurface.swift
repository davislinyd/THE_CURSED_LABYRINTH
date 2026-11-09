import SwiftUI
import RealityKit
import Combine

struct NativeGameSurface:UIViewRepresentable {
    let session:GameSession
    func makeCoordinator()->Coordinator{Coordinator()}
    func makeUIView(context:Context)->ARView {
        let view=ARView(frame:.zero,cameraMode:.nonAR,automaticallyConfigureSession:false)
        view.environment.background = .color(UIColor(red:0.035,green:0.045,blue:0.065,alpha:1))
        view.renderOptions=[.disableMotionBlur,.disableDepthOfField,.disableCameraGrain]
        view.isUserInteractionEnabled=false
        // Keep SwiftUI text at device resolution while limiting only the 3D framebuffer.
        view.contentScaleFactor=2
        view.renderCallbacks.postProcess={ [processor=session.renderer.ink] context in processor.render(context) }
        let anchor=AnchorEntity(world:.zero);anchor.addChild(session.renderer.root);view.scene.addAnchor(anchor)
        context.coordinator.subscription=view.scene.subscribe(to:SceneEvents.Update.self){ [weak session] event in
            let delta=event.deltaTime
            Task { @MainActor in session?.step(delta:delta) }
        }
        Task { @MainActor in await session.renderer.prepare();session.artReady=session.renderer.ready;session.revision+=1 }
        return view
    }
    func updateUIView(_ view:ARView,context:Context){}
    @MainActor final class Coordinator {var subscription:Cancellable?}
}
