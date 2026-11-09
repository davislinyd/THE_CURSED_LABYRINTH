import SwiftUI
import UIKit

struct TouchControls:UIViewRepresentable {
    let session:GameSession
    let revision:Int
    func makeUIView(context:Context)->TouchSurface {TouchSurface(session:session)}
    func updateUIView(_ view:TouchSurface,context:Context) {view.setNeedsDisplay();view.updateAccessibility()}
}

@MainActor private final class ActionElement:UIAccessibilityElement {
    var activation:(()->Void)?
    weak var surface:UIView?
    var localFrame=CGRect.zero
    override var accessibilityFrame:CGRect {
        get{guard let surface,surface.window != nil else{return .zero};return UIAccessibility.convertToScreenCoordinates(localFrame,in:surface)}
        set{super.accessibilityFrame=newValue}
    }
    override func accessibilityActivate()->Bool {activation?();return true}
}

@MainActor final class TouchSurface:UIView {
    weak var session:GameSession?
    private enum Role {case stick,look,button(Action)}
    private var roles:[ObjectIdentifier:Role]=[:]
    private var last:[ObjectIdentifier:CGPoint]=[:]
    private var stickOrigin:CGPoint?
    private var stickID:ObjectIdentifier?
    private var elements:[ActionElement]=[]
    private var actionElements:[Action:ActionElement]=[:]
    private var stickElement:ActionElement?
    init(session:GameSession) {
        self.session=session;super.init(frame:.zero)
        isMultipleTouchEnabled=true;isOpaque=false;backgroundColor = .clear
        accessibilityIdentifier="touch.surface"
    }
    required init?(coder:NSCoder) {fatalError("init(coder:) has not been implemented")}
    override func layoutSubviews(){super.layoutSubviews();updateAccessibility()}
    private var floorY:CGFloat {bounds.height-max(safeAreaInsets.bottom,16)-40}
    private var rightX:CGFloat {bounds.width-max(safeAreaInsets.right,24)-45}
    private var stickCenter:CGPoint {CGPoint(x:max(safeAreaInsets.left,24)+65,y:floorY-30)}
    private func controls()->[(Action,CGRect,String)] {
        let r=rightX,y=floorY
        var result:[(Action,CGRect,String)]=[
            (.attack,CGRect(x:r-30,y:y-76,width:64,height:64),"ATTACK"),
            (.strong,CGRect(x:r-97,y:y-134,width:52,height:52),"STRONG"),
            (.guardAction,CGRect(x:r-158,y:y-77,width:54,height:54),"GUARD"),
            (.dodge,CGRect(x:r-101,y:y-18,width:56,height:56),"DODGE"),
            (.item,CGRect(x:stickCenter.x+76,y:y-9,width:52,height:52),"ITEM"),
            (.cycle,CGRect(x:stickCenter.x+79,y:y-62,width:46,height:46),"↻")]
        if session?.world?.prompt != nil {result.append((.interact,CGRect(x:bounds.midX-82,y:y-14,width:164,height:48),session?.world?.prompt?.label ?? "INTERACT"))}
        return result
    }
    override func draw(_ rect:CGRect) {
        guard let ctx=UIGraphicsGetCurrentContext(),let s=session else{return}
        let base=stickOrigin ?? stickCenter,move=s.touch.move
        ctx.setStrokeColor(UIColor(red:0.76,green:0.66,blue:0.45,alpha:0.5).cgColor);ctx.setLineWidth(1.5)
        ctx.setFillColor(UIColor(red:0.06,green:0.08,blue:0.12,alpha:0.46).cgColor)
        ctx.fillEllipse(in:CGRect(x:base.x-48,y:base.y-48,width:96,height:96));ctx.strokeEllipse(in:CGRect(x:base.x-48,y:base.y-48,width:96,height:96))
        ctx.setFillColor(UIColor(red:0.75,green:0.64,blue:0.44,alpha:stickOrigin==nil ? 0.25:0.65).cgColor)
        ctx.fillEllipse(in:CGRect(x:base.x+CGFloat(move.x)*38-19,y:base.y-CGFloat(move.z)*38-19,width:38,height:38))
        for (action,frame,key) in controls() {
            let held=s.touch.buttons.values.contains(action),main=action == .attack
            let shape=UIBezierPath(roundedRect:frame,cornerRadius:action == .interact ? 12:frame.width/2)
            UIColor(red:main ? 0.48:0.07,green:main ? 0.13:0.09,blue:main ? 0.12:0.13,alpha:held ? 0.95:0.78).setFill();shape.fill()
            UIColor(red:0.78,green:0.67,blue:0.46,alpha:held ? 1:0.7).setStroke();shape.lineWidth=held ? 2.4:1;shape.stroke()
            let text=action == .item ? s.text(s.world.save.selectedItem.uppercased()):s.text(key)
            let base:CGFloat=action == .attack ? 21:action == .interact ? 14:12
            let measured=(text as NSString).size(withAttributes:[.font:UIFont.systemFont(ofSize:base,weight:.semibold)]).width
            let fontSize=min(base,base*(frame.width-12)/max(1,measured))
            let attrs:[NSAttributedString.Key:Any]=[.font:UIFont.systemFont(ofSize:fontSize,weight:.semibold),.foregroundColor:UIColor(red:0.94,green:0.88,blue:0.73,alpha:1)]
            let size=(text as NSString).size(withAttributes:attrs)
            (text as NSString).draw(at:CGPoint(x:frame.midX-size.width/2,y:frame.midY-size.height/2),withAttributes:attrs)
            if action == .item {
                let n="\(s.world.save.items[s.world.save.selectedItem,default:0])"
                (n as NSString).draw(at:CGPoint(x:frame.maxX-12,y:frame.maxY-12),withAttributes:[.font:UIFont.monospacedDigitSystemFont(ofSize:12,weight:.bold),.foregroundColor:UIColor.white])
            }
        }
    }
    override func touchesBegan(_ touches:Set<UITouch>,with event:UIEvent?) {
        guard let s=session,s.world.playing else{return}
        for touch in touches {
            let id=ObjectIdentifier(touch),p=touch.location(in:self);last[id]=p
            if let control=controls().first(where:{$0.1.insetBy(dx:-3,dy:-3).contains(p)}) {
                roles[id] = .button(control.0);s.touch.down(id.hashValue,action:control.0)
            } else if p.x<bounds.midX && stickID==nil {
                roles[id] = .stick;stickID=id;stickOrigin=p
            } else {roles[id] = .look}
        };setNeedsDisplay()
    }
    override func touchesMoved(_ touches:Set<UITouch>,with event:UIEvent?) {
        guard let s=session else{return}
        for touch in touches {
            let id=ObjectIdentifier(touch),p=touch.location(in:self)
            switch roles[id] {
            case .stick:
                if let o=stickOrigin {var m=Point(x:Float(p.x-o.x)/48,z:Float(o.y-p.y)/48);if m.length>1 {m=m.normalized};if m.length<0.12 {m=Point()};s.touch.move=m}
            case .look:
                if let old=last[id] {s.touch.look=s.touch.look+Point(x:Float(p.x-old.x)*0.004,z:Float(p.y-old.y)*0.004)}
            default:break
            };last[id]=p
        };setNeedsDisplay()
    }
    override func touchesEnded(_ touches:Set<UITouch>,with event:UIEvent?) {finish(touches)}
    override func touchesCancelled(_ touches:Set<UITouch>,with event:UIEvent?) {finish(touches)}
    private func finish(_ touches:Set<UITouch>) {
        for touch in touches {
            let id=ObjectIdentifier(touch)
            if case .stick=roles[id] {session?.touch.move=Point();stickOrigin=nil;stickID=nil}
            session?.touch.up(id.hashValue);roles.removeValue(forKey:id);last.removeValue(forKey:id)
        };setNeedsDisplay()
    }
    override func didMoveToWindow() {if window==nil {session?.touch.reset();roles.removeAll();last.removeAll();stickID=nil;stickOrigin=nil}}
    func updateAccessibility() {
        guard let session,bounds.width>0,bounds.height>0 else{return}
        elements=controls().map {action,frame,key in
            let e=actionElements[action] ?? ActionElement(accessibilityContainer:self)
            actionElements[action]=e;e.surface=self;e.accessibilityIdentifier="control.\(action.rawValue)";e.accessibilityLabel=session.text(key);e.accessibilityTraits = .button;e.localFrame=frame
            e.activation={ [weak session] in session?.touch.latched.insert(action) };return e
        }
        let stick=stickElement ?? ActionElement(accessibilityContainer:self);stickElement=stick;stick.surface=self;stick.accessibilityIdentifier="control.move";stick.accessibilityLabel=session.zh ? "移動搖桿":"Movement joystick"
        stick.localFrame=CGRect(x:stickCenter.x-60,y:stickCenter.y-60,width:120,height:120);elements.append(stick)
        accessibilityElements=elements
    }
}
