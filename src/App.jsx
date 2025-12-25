import React, { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

// --- 配置常量 ---
const COLORS = ['#FFD700', '#C41E3A', '#50C878', '#FFFFFF']; // 金、红、绿、白
const PARTICLE_COUNT = 2000;

// --- 3D 场景组件 ---
const ParticleSystem = ({ gestureRef, handPosRef }) => {
  const meshRef = useRef();
  const starRef = useRef();
  const groupRef = useRef(); // 用于整体跟随手势转动
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // 1. 初始化粒子位置
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const color = new THREE.Color(COLORS[Math.floor(Math.random() * COLORS.length)]);
      
      // 星云形态
      const r = 15 * Math.cbrt(Math.random());
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1);
      const nebulaPos = new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
      
      // 圣诞树形态
      const h = Math.random() * 20 - 10;
      const maxR = (10 - h) * 0.45; 
      const angle = h * 6 + Math.random() * Math.PI * 2;
      const treePos = new THREE.Vector3(
        Math.cos(angle) * maxR,
        h,
        Math.sin(angle) * maxR
      );

      temp.push({
        currentPos: nebulaPos.clone(),
        nebulaPos,
        treePos,
        color,
        scale: Math.random() * 0.3 + 0.1,
      });
    }
    return temp;
  }, []);

  // 2. 强制初始化第一帧
  useLayoutEffect(() => {
    if (meshRef.current) {
        particles.forEach((particle, i) => {
            dummy.position.copy(particle.currentPos);
            dummy.scale.setScalar(particle.scale);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
            meshRef.current.setColorAt(i, particle.color);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [particles, dummy]);

  // 3. 动画循环
  useFrame((state) => {
    if (!meshRef.current || !groupRef.current) return;

    const currentGesture = gestureRef.current;
    
    // --- 核心修改：跟随手部移动 (Follow Hand) ---
    // 读取手部归一化坐标 (-1 到 1)
    const targetRotX = -handPosRef.current.y * 0.5; // 上下移动导致绕X轴旋转
    const targetRotY = -handPosRef.current.x * 0.5; // 左右移动导致绕Y轴旋转

    // 平滑插值 (Lerp) 实现跟随
    groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetRotX, 0.1);
    groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotY, 0.1);


    // --- 粒子形态变换 ---
    // 自动自转 (只有在 IDLE 或 树 模式下才自转，炸开时不转)
    if (currentGesture !== 'EXPLODE') {
        meshRef.current.rotation.y += 0.002;
    }

    // 星星动画
    if (starRef.current) {
        starRef.current.rotation.y -= 0.02;
        const isTree = currentGesture === 'TREE';
        // 树模式：星星在树顶；炸开/闲置：星星飞走
        const targetY = isTree ? 10.5 : 50; 
        const targetScale = isTree ? 1 : 0;

        starRef.current.position.y = THREE.MathUtils.lerp(starRef.current.position.y, targetY, 0.05);
        starRef.current.scale.setScalar(THREE.MathUtils.lerp(starRef.current.scale.x, targetScale, 0.05));
    }

    // 粒子位置更新
    particles.forEach((particle, i) => {
      let target;
      let lerpSpeed = 0.04;

      if (currentGesture === 'TREE') {
        target = particle.treePos;
        lerpSpeed = 0.06;
      } else if (currentGesture === 'EXPLODE') {
        // 炸开：基于星云位置放大
        target = particle.nebulaPos.clone().multiplyScalar(2.5);
        lerpSpeed = 0.08;
      } else {
        target = particle.nebulaPos;
      }

      particle.currentPos.lerp(target, lerpSpeed);
      
      // 粒子漂浮呼吸感
      const floatY = Math.sin(state.clock.elapsedTime * 2 + i) * 0.05;
      dummy.position.copy(particle.currentPos);
      dummy.position.y += floatY;
      dummy.scale.setScalar(particle.scale);
      dummy.updateMatrix();

      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    // 使用 group 包裹整个场景，用于实现跟随手势的整体旋转
    <group ref={groupRef}>
        <instancedMesh ref={meshRef} args={[null, null, PARTICLE_COUNT]}>
            <sphereGeometry args={[0.4, 16, 16]} />
            <meshBasicMaterial color="#fff" toneMapped={false} />
        </instancedMesh>

        {/* 顶部星星 */}
        <group ref={starRef} position={[0, 100, 0]}>
             <mesh>
                <dodecahedronGeometry args={[1.5, 0]} />
                <meshBasicMaterial color="#FFD700" toneMapped={false} />
            </mesh>
            {/* 这里的点光源照亮周围粒子 */}
            <pointLight distance={20} intensity={3} color="#FFD700" decay={2} />
        </group>
    </group>
  );
};

// --- 主程序 ---
export default function MerryChristmasFinal() {
  const [started, setStarted] = useState(false);
  const [uiGesture, setUiGesture] = useState('IDLE');
  
  // Refs
  const gestureRef = useRef('IDLE'); 
  const handPosRef = useRef({ x: 0, y: 0 }); // 存储手部中心坐标
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // 手势判断逻辑
  const processHands = (landmarks) => {
    const wrist = landmarks[0];
    
    // 1. 更新手部位置 (用于控制 3D 场景旋转)
    // MediaPipe 坐标范围 [0, 1]，我们需要将其映射到 [-1, 1]
    // 注意：x 需要反转，因为摄像头是镜像的
    const centerX = (0.5 - wrist.x) * 2; // 范围变为 -1 到 1
    const centerY = (0.5 - wrist.y) * 2; 
    
    // 增加一点灵敏度乘数
    handPosRef.current = { x: centerX * 1.5, y: centerY * 1.5 };

    // 2. 判断手势 (张开 vs 握拳)
    let openCount = 0;
    const tips = [8, 12, 16, 20];
    const pips = [6, 10, 14, 18];
    
    // 简单的距离法判断手指是否伸直
    for (let i = 0; i < 4; i++) {
       const distTip = Math.hypot(landmarks[tips[i]].x - wrist.x, landmarks[tips[i]].y - wrist.y);
       const distPip = Math.hypot(landmarks[pips[i]].x - wrist.x, landmarks[pips[i]].y - wrist.y);
       if (distTip > distPip) openCount++;
    }
    // 拇指判断
    if (Math.abs(landmarks[4].x - landmarks[17].x) > Math.abs(landmarks[3].x - landmarks[17].x)) openCount++;

    let detected = 'IDLE';
    if (openCount >= 4) detected = 'EXPLODE';
    if (openCount <= 1) detected = 'TREE';

    gestureRef.current = detected;
    setUiGesture(detected);
  };

  useEffect(() => {
    if (!started) return;

    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    hands.onResults((results) => {
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, 320, 240);
            
            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                const landmarks = results.multiHandLandmarks[0];
                // 绘制骨架
                drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
                drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 1 });
                
                // 处理逻辑
                processHands(landmarks);
            } else {
                // 没检测到手，慢慢复位
                handPosRef.current = { x: 0, y: 0 };
                gestureRef.current = 'IDLE';
                setUiGesture('IDLE');
            }
        }
    });

    if (videoRef.current) {
        const camera = new Camera(videoRef.current, {
            onFrame: async () => {
                if(videoRef.current) await hands.send({ image: videoRef.current });
            },
            width: 320,
            height: 240,
        });
        camera.start();
    }
  }, [started]);

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'black', overflow: 'hidden' }}>
      
      <Canvas dpr={[1, 2]} gl={{ antialias: false }}>
        {/* 背景色必须设置，否则 EffectComposer 可能黑屏 */}
        <color attach="background" args={['#050505']} />
        
        <PerspectiveCamera makeDefault position={[0, 0, 35]} fov={50} />
        <ambientLight intensity={1} />

        {/* 粒子系统 */}
        <ParticleSystem gestureRef={gestureRef} handPosRef={handPosRef} />
        
        {/* 后期特效 */}
        <EffectComposer disableNormalPass>
            <Bloom luminanceThreshold={0.1} mipmapBlur intensity={1.5} radius={0.5} />
        </EffectComposer>

        {/* 标题 - 移除了自定义 font 链接，使用默认字体以防报错 */}
        <Text 
            position={[0, 13, 0]} 
            fontSize={2} 
            anchorX="center" 
            anchorY="middle"
            letterSpacing={0.1}
        >
          MERRY CHRISTMAS
          {/* 金色发光材质 */}
          <meshBasicMaterial color="#FFD700" toneMapped={false} />
        </Text>
      </Canvas>

      {/* 监控界面 */}
      {started ? (
        <div style={{
            position: 'absolute', bottom: 20, left: 20,
            background: 'rgba(20,20,20,0.8)', 
            border: '1px solid #444', borderRadius: 12, padding: 12,
            boxShadow: '0 0 20px rgba(0,0,0,0.5)',
            pointerEvents: 'none' // 让鼠标穿透
        }}>
            <div style={{ display: 'flex', gap: 15, justifyContent: 'center', marginBottom: 8, fontSize: '12px', fontFamily: 'monospace' }}>
                <span style={{ color: uiGesture === 'EXPLODE' ? '#0ff' : '#555', fontWeight: 'bold' }}>● EXPLODE</span>
                <span style={{ color: uiGesture === 'TREE' ? '#0f0' : '#555', fontWeight: 'bold' }}>● TREE</span>
            </div>
            <div style={{ position: 'relative', width: 200, height: 150, background: '#000', borderRadius: 8, overflow: 'hidden' }}>
                <video ref={videoRef} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5 }} playsInline muted />
                <canvas ref={canvasRef} width={320} height={240} style={{ position: 'absolute', width: '100%', height: '100%' }} />
            </div>
            <div style={{ color: '#aaa', fontSize: '10px', marginTop: 5, textAlign: 'center' }}>MOVE HAND TO ROTATE</div>
        </div>
      ) : (
        /* 欢迎页 */
        <div style={{
            position: 'absolute', inset: 0, background: 'black', zIndex: 100,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
        }}>
            <h1 style={{ color: '#FFD700', fontSize: '4rem', margin: 0, textShadow: '0 0 30px #FFD700' }}>MERRY CHRISTMAS</h1>
            <p style={{ color: '#888', marginTop: 10 }}>HAND GESTURE EXPERIENCE</p>
            <button 
                onClick={() => setStarted(true)}
                style={{
                    marginTop: 40, padding: '15px 50px', fontSize: '1.2rem',
                    background: '#C41E3A', color: 'white', border: 'none',
                    borderRadius: 30, cursor: 'pointer',
                    boxShadow: '0 0 20px #C41E3A'
                }}
            >
                START
            </button>
        </div>
      )}
    </div>
  );
}