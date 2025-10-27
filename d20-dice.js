import { __awaiter } from "tslib";
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
export class D20Dice {
    constructor(container, settings) {
        this.isRolling = false;
        this.animationId = null;
        this.rollTimeout = null;
        this.isDragging = false;
        this.dragStartPosition = { x: 0, y: 0 };
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.lastMousePosition = { x: 0, y: 0, time: 0 };
        this.mouseVelocity = { x: 0, y: 0 };
        this.isHoveringDice = false;
        this.faceNumbers = [];
        this.faceNormals = [];
        // Multi-dice support arrays
        this.diceArray = [];
        this.diceBodyArray = [];
        this.diceTypeArray = [];
        this.selectedDice = [];
        this.draggedDiceIndex = -1;
        this.trayMesh = null;
        this.windowBorder = null;
        this.hoverCircle = null;
        this.hoverCircleMaterial = null;
        this.floorHeight = -2.4;
        this.forceClickthroughMode = false;
        this.onRollComplete = null;
        this.ambientLight = null;
        this.directionalLight = null;
        // Old roll method removed - replaced by enhanced roll method with individual dice tracking
        this.rollResolve = null;
        this.multiRollResolve = null;
        this.rollTimeoutId = null;
        this.showingResult = false;
        // Callback for when calibration changes
        this.onCalibrationChanged = null;
        // Individual dice states for enhanced roll system
        this.diceStates = [];
        this.currentMonitor = null;
        this.originalMaterials = new Map();
        this.container = container;
        this.settings = settings;
        console.log('🎲 D20Dice initialized with settings:', {
            motionThreshold: settings.motionThreshold,
            enableResultAnimation: settings.enableResultAnimation,
            diceSize: settings.diceSize
        });
        this.init();
    }
    init() {
        try {
            // Initialize Three.js scene with transparent background
            this.scene = new THREE.Scene();
            // No background color - will be transparent
            // Setup orthographic camera - will be properly sized in updateSize
            const aspect = window.innerWidth / (window.innerHeight - 44);
            const frustumSize = 20;
            this.camera = new THREE.OrthographicCamera(-frustumSize * aspect / 2, frustumSize * aspect / 2, frustumSize / 2, -frustumSize / 2, 0.1, 1000);
            this.camera.position.set(0, 20, 0);
            this.camera.lookAt(0, -2, 0);
            this.camera.up.set(0, 0, -1);
            // Setup renderer to fill container
            this.renderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha: true,
                preserveDrawingBuffer: false,
                powerPreference: "high-performance"
            });
            // Configure shadow mapping based on settings
            this.renderer.shadowMap.enabled = this.settings.enableShadows;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows for better quality
            // Add WebGL context loss/restore handlers
            const canvas = this.renderer.domElement;
            canvas.addEventListener('webglcontextlost', (event) => {
                console.warn('WebGL context lost, attempting to prevent default');
                event.preventDefault();
            });
            canvas.addEventListener('webglcontextrestored', () => {
                console.log('WebGL context restored, reinitializing scene');
                this.reinitializeAfterContextLoss();
            });
            this.container.appendChild(canvas);
            // Create window border if enabled
            this.createWindowBorder();
            // Set initial size to fill container
            this.setInitialSize();
            // Setup drag controls and mouse interactions
            this.setupDragControls();
            // Initialize physics world
            this.initPhysics();
            // Create tray but no initial dice (multi-dice system)
            this.createDiceTray();
            this.setupLighting();
            this.animate();
        }
        catch (error) {
            console.error('Failed to initialize D20 dice:', error);
            console.error('Error details:', error.message, error.stack);
            this.container.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted);">3D rendering not available<br><small>Error: ${error.message}</small></div>`;
        }
    }
    initPhysics() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0); // Realistic Earth gravity (9.82 m/s²)
        console.log(`🌍 Physics world initialized with gravity: ${this.world.gravity.y}`);
        // Set up advanced physics for more accurate simulation
        this.world.broadphase.useBoundingBoxes = true;
        this.world.defaultContactMaterial.contactEquationStiffness = 1e7;
        this.world.defaultContactMaterial.contactEquationRelaxation = 4;
        this.world.broadphase = new CANNON.NaiveBroadphase();
    }
    createDiceTray() {
        // Create visual tray based on settings
        if (this.settings.showSurface) {
            const trayWidth = 32 * this.settings.trayWidth;
            const trayLength = 24 * this.settings.trayLength;
            const trayGeometry = new THREE.BoxGeometry(trayWidth, 0.8, trayLength);
            const trayMaterial = new THREE.MeshPhongMaterial({
                color: this.settings.surfaceColor,
                transparent: this.settings.surfaceOpacity < 1,
                opacity: this.settings.surfaceOpacity
            });
            this.trayMesh = new THREE.Mesh(trayGeometry, trayMaterial);
            this.trayMesh.position.set(0, -2, 0);
            this.trayMesh.receiveShadow = this.settings.surfaceReceiveShadow;
            this.scene.add(this.trayMesh);
            // Add border if enabled (using tray's own border settings)
            if (this.settings.surfaceBorderWidth > 0 && this.settings.surfaceBorderOpacity > 0) {
                const borderGeometry = new THREE.EdgesGeometry(trayGeometry);
                const borderMaterial = new THREE.LineBasicMaterial({
                    color: this.settings.surfaceBorderColor,
                    transparent: this.settings.surfaceBorderOpacity < 1,
                    opacity: this.settings.surfaceBorderOpacity,
                    linewidth: this.settings.surfaceBorderWidth
                });
                const borderLines = new THREE.LineSegments(borderGeometry, borderMaterial);
                borderLines.position.copy(this.trayMesh.position);
                this.scene.add(borderLines);
            }
        }
        // Physics tray floor - realistic felt surface
        const floorMaterial = new CANNON.Material('floor');
        floorMaterial.restitution = 0.25; // Felt absorbs energy (low bounce)
        floorMaterial.friction = 0.7; // Felt has high friction
        const floorShape = new CANNON.Plane();
        const floorBody = new CANNON.Body({ mass: 0, material: floorMaterial });
        floorBody.addShape(floorShape);
        floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        floorBody.position.set(0, -2.4, 0);
        this.floorHeight = floorBody.position.y;
        this.world.addBody(floorBody);
        // Physics tray walls - realistic wood/plastic walls
        const wallMaterial = new CANNON.Material('wall');
        wallMaterial.restitution = 0.45; // Moderate bounce off walls
        wallMaterial.friction = 0.3; // Smooth wall surface
        // Calculate wall dimensions based on tray settings
        const trayWidth = 32 * this.settings.trayWidth;
        const trayLength = 24 * this.settings.trayLength;
        const halfWidth = trayWidth / 2;
        const halfLength = trayLength / 2;
        // Left wall
        const leftWallShape = new CANNON.Box(new CANNON.Vec3(0.2, 4, halfLength));
        const leftWall = new CANNON.Body({ mass: 0, material: wallMaterial });
        leftWall.addShape(leftWallShape);
        leftWall.position.set(-halfWidth, 0, 0);
        this.world.addBody(leftWall);
        // Right wall
        const rightWallShape = new CANNON.Box(new CANNON.Vec3(0.2, 4, halfLength));
        const rightWall = new CANNON.Body({ mass: 0, material: wallMaterial });
        rightWall.addShape(rightWallShape);
        rightWall.position.set(halfWidth, 0, 0);
        this.world.addBody(rightWall);
        // Front wall
        const frontWallShape = new CANNON.Box(new CANNON.Vec3(halfWidth, 4, 0.2));
        const frontWall = new CANNON.Body({ mass: 0, material: wallMaterial });
        frontWall.addShape(frontWallShape);
        frontWall.position.set(0, 0, halfLength);
        this.world.addBody(frontWall);
        // Back wall
        const backWallShape = new CANNON.Box(new CANNON.Vec3(halfWidth, 4, 0.2));
        const backWall = new CANNON.Body({ mass: 0, material: wallMaterial });
        backWall.addShape(backWallShape);
        backWall.position.set(0, 0, -halfLength);
        this.world.addBody(backWall);
    }
    createDice() {
        // DISABLED: Legacy single-dice creation method
        // Multi-dice system uses createSingleDice() instead
        console.log('createDice() called but disabled for multi-dice system');
        return;
        // Create a basic fallback material with all configured properties
        const fallbackMaterialProps = {
            color: this.settings.diceColor,
            shininess: this.settings.diceShininess,
            specular: this.settings.diceSpecular,
            transparent: this.settings.diceTransparent,
            opacity: this.settings.diceOpacity
        };
        // Add normal map to fallback material if available
        const normalMapData = this.getCurrentDiceNormalMapData();
        if (normalMapData) {
            const normalMap = this.loadNormalMap(normalMapData);
            if (normalMap) {
                fallbackMaterialProps.normalMap = normalMap;
            }
        }
        const fallbackMaterial = new THREE.MeshPhongMaterial(fallbackMaterialProps);
        this.dice = new THREE.Mesh(this.diceGeometry, fallbackMaterial);
        // Ensure dice is visible by making it reasonably sized
        console.log(`Creating dice with size: ${this.settings.diceSize}, type: ${this.settings.diceType}`);
        this.dice.castShadow = this.settings.diceCastShadow;
        this.dice.receiveShadow = this.settings.diceReceiveShadow;
        this.dice.position.set(0, 2, 0);
        this.scene.add(this.dice);
        // Initialize face numbers for d20 (1-20 mapped to faces)
        this.initializeFaceNumbers();
        // NOTE: Legacy single-dice physics disabled for multi-dice system
        // this.createPhysicsBody();
        // Calculate face normals for the dice type
        this.calculateFaceNormals();
        this.addDiceTextures();
    }
    createDiceGeometry() {
        let geometry;
        switch (this.settings.diceType) {
            case 'd4':
                geometry = new THREE.TetrahedronGeometry(this.settings.diceSize, 0);
                this.applyTetrahedronUVMapping(geometry);
                return geometry;
            case 'd6':
                geometry = new THREE.BoxGeometry(this.settings.diceSize * 2, this.settings.diceSize * 2, this.settings.diceSize * 2);
                this.applySquareUVMapping(geometry);
                return geometry;
            case 'd8':
                geometry = new THREE.OctahedronGeometry(this.settings.diceSize, 0);
                this.applyTriangleUVMapping(geometry, 8);
                return geometry;
            case 'd10': {
                geometry = this.createD10PolyhedronGeometry(this.settings.diceSize);
                // Apply UV mapping for D10 (10 kite-shaped faces)
                this.applyD10UVMapping(geometry);
                return geometry;
            }
            case 'd12':
                geometry = new THREE.DodecahedronGeometry(this.settings.diceSize, 0);
                this.applyD12PentagonUVMapping(geometry);
                return geometry;
            case 'd20':
            default:
                geometry = new THREE.IcosahedronGeometry(this.settings.diceSize, 0);
                this.applyTriangleUVMapping(geometry, 20);
                return geometry;
        }
    }
    createD10PolyhedronGeometry(size) {
        // Based on react-3d-dice implementation
        const sides = 10;
        const vertices = [0, 0, 1, 0, 0, -1];
        // Create vertices around the middle
        for (let i = 0; i < sides; ++i) {
            const angle = (i * Math.PI * 2) / sides;
            vertices.push(-Math.cos(angle), -Math.sin(angle), 0.105 * (i % 2 ? 1 : -1));
        }
        // Define faces (triangles) - based on react-3d-dice
        const faces = [
            [0, 2, 3], [0, 3, 4], [0, 4, 5], [0, 5, 6], [0, 6, 7],
            [0, 7, 8], [0, 8, 9], [0, 9, 10], [0, 10, 11], [0, 11, 2],
            [1, 3, 2], [1, 4, 3], [1, 5, 4], [1, 6, 5], [1, 7, 6],
            [1, 8, 7], [1, 9, 8], [1, 10, 9], [1, 11, 10], [1, 2, 11]
        ];
        // Create THREE.js PolyhedronGeometry
        const geometry = new THREE.PolyhedronGeometry(vertices, faces.flat(), size, 0 // Detail level 0 for sharp edges
        );
        return geometry;
    }
    applyD10UVMapping(geometry) {
        // Convert to non-indexed geometry
        const nonIndexedGeometry = geometry.toNonIndexed();
        geometry.attributes = nonIndexedGeometry.attributes;
        geometry.index = null;
        const uvAttribute = geometry.attributes.uv;
        const uvArray = uvAttribute.array;
        const positionAttribute = geometry.attributes.position;
        const positionArray = positionAttribute.array;
        const totalTriangles = uvAttribute.count / 3;
        console.log(`D10: ${totalTriangles} triangles total`);
        // 5x2 grid for 10 faces
        const cols = 5;
        const rows = 2;
        const cellWidth = 1.0 / cols;
        const cellHeight = 1.0 / rows;
        const padding = 0.02;
        // Group triangles by face based on normals
        const faceGroups = [];
        const faceNormals = [];
        for (let i = 0; i < totalTriangles; i++) {
            const vertexOffset = i * 3;
            // Calculate triangle normal
            const v1 = new THREE.Vector3(positionArray[vertexOffset * 3], positionArray[vertexOffset * 3 + 1], positionArray[vertexOffset * 3 + 2]);
            const v2 = new THREE.Vector3(positionArray[(vertexOffset + 1) * 3], positionArray[(vertexOffset + 1) * 3 + 1], positionArray[(vertexOffset + 1) * 3 + 2]);
            const v3 = new THREE.Vector3(positionArray[(vertexOffset + 2) * 3], positionArray[(vertexOffset + 2) * 3 + 1], positionArray[(vertexOffset + 2) * 3 + 2]);
            const edge1 = new THREE.Vector3().subVectors(v2, v1);
            const edge2 = new THREE.Vector3().subVectors(v3, v1);
            const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
            // Find or create face group
            let faceIndex = -1;
            for (let j = 0; j < faceNormals.length; j++) {
                if (faceNormals[j].dot(normal) > 0.95) {
                    faceIndex = j;
                    break;
                }
            }
            if (faceIndex === -1) {
                faceIndex = faceNormals.length;
                faceNormals.push(normal.clone());
                faceGroups.push([]);
            }
            faceGroups[faceIndex].push(i);
        }
        console.log(`D10: Found ${faceGroups.length} faces`);
        // Map each face group to UV coordinates
        for (let faceIndex = 0; faceIndex < Math.min(faceGroups.length, 10); faceIndex++) {
            const triangles = faceGroups[faceIndex];
            //// Calculate face normal to determine if it's top or bottom hemisphere
            //const firstTriangle = triangles[0];
            //const vertexOffset = firstTriangle * 3;
            //const v1 = new THREE.Vector3(
            //    positionArray[vertexOffset * 3],
            //    positionArray[vertexOffset * 3 + 1],
            //    positionArray[vertexOffset * 3 + 2]
            //);
            //const v2 = new THREE.Vector3(
            //    positionArray[(vertexOffset + 1) * 3],
            //    positionArray[(vertexOffset + 1) * 3 + 1],
            //    positionArray[(vertexOffset + 1) * 3 + 2]
            //);
            //const v3 = new THREE.Vector3(
            //    positionArray[(vertexOffset + 2) * 3],
            //    positionArray[(vertexOffset + 2) * 3 + 1],
            //    positionArray[(vertexOffset + 2) * 3 + 2]
            //);
            //// Calculate face center and normal
            //const faceCenter = new THREE.Vector3().addVectors(v1, v2).add(v3).divideScalar(3);
            //const edge1 = new THREE.Vector3().subVectors(v2, v1);
            //const edge2 = new THREE.Vector3().subVectors(v3, v1);
            //const faceNormal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
            // Determine if this is a top face (Y > 0) or bottom face (Y < 0)
            /*const isTopFace = faceCenter.y > 0;*/
            const isTopFace = faceIndex >= 1 && faceIndex <= 4;
            const col = faceIndex % cols;
            const row = Math.floor(faceIndex / cols);
            const cellLeft = col * cellWidth + padding;
            const cellRight = (col + 1) * cellWidth - padding;
            const cellTop = row * cellHeight + padding;
            const cellBottom = (row + 1) * cellHeight - padding;
            const cellCenterX = (cellLeft + cellRight) / 2;
            // Define the 4 vertices of the kite shape (top 80%, bottom 20%)
            const kiteCenter = cellTop + (cellBottom - cellTop) * 0.8; // 80% down from top
            let kiteVertices;
            // Map triangles to the kite
            for (let t = 0; t < triangles.length; t++) {
                const triangleIndex = triangles[t];
                const vertexOffset = triangleIndex * 3;
                const uvIndex = vertexOffset * 2;
                if (isTopFace) {
                    kiteVertices = [
                        { x: cellCenterX, y: cellTop },
                        { x: cellLeft, y: kiteCenter },
                        { x: cellCenterX, y: cellBottom },
                        { x: cellRight, y: kiteCenter } // Left vertex (3) - at 80% point
                    ];
                    if (t === 0) {
                        // First triangle
                        uvArray[uvIndex] = kiteVertices[3].x;
                        uvArray[uvIndex + 1] = kiteVertices[3].y;
                        uvArray[uvIndex + 2] = kiteVertices[2].x;
                        uvArray[uvIndex + 3] = kiteVertices[2].y;
                        uvArray[uvIndex + 4] = kiteVertices[0].x;
                        uvArray[uvIndex + 5] = kiteVertices[0].y;
                    }
                    else if (t === 1) {
                        // Second triangle
                        uvArray[uvIndex] = kiteVertices[2].x;
                        uvArray[uvIndex + 1] = kiteVertices[2].y;
                        uvArray[uvIndex + 2] = kiteVertices[1].x;
                        uvArray[uvIndex + 3] = kiteVertices[1].y;
                        uvArray[uvIndex + 4] = kiteVertices[0].x;
                        uvArray[uvIndex + 5] = kiteVertices[0].y;
                    }
                }
                else {
                    kiteVertices = [
                        { x: cellCenterX, y: cellBottom },
                        { x: cellRight, y: kiteCenter },
                        { x: cellCenterX, y: cellTop },
                        { x: cellLeft, y: kiteCenter } // Left vertex (3) - at 80% point
                    ];
                    if (t === 0) {
                        // First triangle
                        uvArray[uvIndex] = kiteVertices[0].x;
                        uvArray[uvIndex + 1] = kiteVertices[0].y;
                        uvArray[uvIndex + 2] = kiteVertices[3].x;
                        uvArray[uvIndex + 3] = kiteVertices[3].y;
                        uvArray[uvIndex + 4] = kiteVertices[2].x;
                        uvArray[uvIndex + 5] = kiteVertices[2].y;
                    }
                    else if (t === 1) {
                        // Second triangle
                        uvArray[uvIndex] = kiteVertices[1].x;
                        uvArray[uvIndex + 1] = kiteVertices[1].y;
                        uvArray[uvIndex + 2] = kiteVertices[0].x;
                        uvArray[uvIndex + 3] = kiteVertices[0].y;
                        uvArray[uvIndex + 4] = kiteVertices[2].x;
                        uvArray[uvIndex + 5] = kiteVertices[2].y;
                    }
                }
            }
        }
        uvAttribute.needsUpdate = true;
        console.log('Applied D10 UV mapping with proper kite faces');
    }
    createPentagonalTrapezohedronGeometry(size) {
        const geometry = new THREE.BufferGeometry();
        const topHeight = size * 0.75;
        const bottomHeight = -topHeight;
        const ringRadius = size * 0.9;
        const topVertices = [];
        const bottomVertices = [];
        for (let i = 0; i < 5; i++) {
            const angle = (i * Math.PI * 2) / 5;
            topVertices.push(new THREE.Vector3(Math.cos(angle) * ringRadius, topHeight, Math.sin(angle) * ringRadius));
            const bottomAngle = angle + Math.PI / 5;
            bottomVertices.push(new THREE.Vector3(Math.cos(bottomAngle) * ringRadius, bottomHeight, Math.sin(bottomAngle) * ringRadius));
        }
        const positions = [];
        const uvs = [];
        const addTriangle = (v1, uv1, v2, uv2, v3, uv3) => {
            positions.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);
            uvs.push(uv1[0], uv1[1], uv2[0], uv2[1], uv3[0], uv3[1]);
        };
        const cols = 5;
        const rows = 2;
        const cellWidth = 1 / cols;
        const cellHeight = 1 / rows;
        const padding = 0.02;
        const getCell = (faceIndex) => {
            const col = faceIndex % cols;
            const row = Math.floor(faceIndex / cols);
            const left = col * cellWidth + padding;
            const right = (col + 1) * cellWidth - padding;
            const top = row * cellHeight + padding;
            const bottom = (row + 1) * cellHeight - padding;
            const center = (left + right) / 2;
            return { left, right, top, bottom, center };
        };
        // Upper ring faces (0-4)
        for (let i = 0; i < 5; i++) {
            const next = (i + 1) % 5;
            const { left, right, top, bottom, center } = getCell(i);
            const t0 = topVertices[i];
            const b0 = bottomVertices[i];
            const t1 = topVertices[next];
            const b1 = bottomVertices[next];
            addTriangle(t0, [center, top], b0, [left, bottom], t1, [right, top]);
            addTriangle(t1, [right, top], b0, [left, bottom], b1, [right, bottom]);
        }
        // Lower ring faces (5-9)
        for (let i = 0; i < 5; i++) {
            const prev = (i - 1 + 5) % 5;
            const { left, right, top, bottom, center } = getCell(i + 5);
            const t0 = topVertices[i];
            const bPrev = bottomVertices[prev];
            const tPrev = topVertices[prev];
            const b0 = bottomVertices[i];
            addTriangle(t0, [center, top], bPrev, [right, bottom], tPrev, [right, top]);
            addTriangle(t0, [center, top], b0, [left, bottom], bPrev, [right, bottom]);
        }
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.computeVertexNormals();
        return geometry;
    }
    applyTriangleUVMapping(geometry, faceCount) {
        // Convert to non-indexed geometry so each face has its own vertices
        const nonIndexedGeometry = geometry.toNonIndexed();
        geometry.attributes = nonIndexedGeometry.attributes;
        geometry.index = null;
        const uvAttribute = geometry.attributes.uv;
        const uvArray = uvAttribute.array;
        // Define UV layout in a grid that matches the template generation
        let cols, rows;
        if (faceCount === 4) {
            // D4: 2x2 grid to match template
            cols = 2;
            rows = 2;
        }
        else if (faceCount === 8) {
            // D8: 3x3 grid to match template
            cols = 3;
            rows = 3;
        }
        else if (faceCount === 12) {
            // D12: 4x3 grid to match template
            cols = 4;
            rows = 3;
        }
        else if (faceCount === 20) {
            // D20: 5x4 grid to match template
            cols = 5;
            rows = 4;
        }
        else {
            // Fallback: square-ish grid
            cols = Math.ceil(Math.sqrt(faceCount));
            rows = Math.ceil(faceCount / cols);
        }
        console.log(`Applying triangle UV mapping for ${faceCount} faces using ${cols}x${rows} grid`);
        const cellWidth = 1.0 / cols;
        const cellHeight = 1.0 / rows;
        const padding = 0.02; // Small padding between triangles
        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
            // Calculate grid position
            const col = faceIndex % cols;
            const row = Math.floor(faceIndex / cols);
            // Calculate cell bounds with padding
            const cellLeft = col * cellWidth + padding;
            const cellRight = (col + 1) * cellWidth - padding;
            const cellTop = row * cellHeight + padding;
            const cellBottom = (row + 1) * cellHeight - padding;
            // Calculate cell center and size
            const cellCenterX = (cellLeft + cellRight) / 2;
            const cellCenterY = (cellTop + cellBottom) / 2;
            const cellW = cellRight - cellLeft;
            const cellH = cellBottom - cellTop;
            // Create equilateral triangle that fits within the cell
            const triangleHeight = Math.min(cellH, cellW * Math.sqrt(3) / 2);
            const triangleWidth = triangleHeight * 2 / Math.sqrt(3);
            // All triangles point up for consistency
            const v1 = {
                x: cellCenterX,
                y: cellTop
            };
            const v2 = {
                x: cellCenterX - triangleWidth / 2,
                y: cellTop + triangleHeight
            };
            const v3 = {
                x: cellCenterX + triangleWidth / 2,
                y: cellTop + triangleHeight
            };
            // Ensure triangles don't exceed cell boundaries
            const vertices = [v1, v2, v3];
            vertices.forEach(v => {
                v.x = Math.max(cellLeft, Math.min(cellRight, v.x));
                v.y = Math.max(cellTop, Math.min(cellBottom, v.y));
            });
            // Set UV coordinates for the three vertices of this face
            const vertexOffset = faceIndex * 3;
            // First vertex UVs (RESTORE D20 Y-FLIP)
            uvArray[(vertexOffset * 2)] = v1.x;
            uvArray[(vertexOffset * 2) + 1] = 1.0 - v1.y;
            // Second vertex UVs (RESTORE D20 Y-FLIP)
            uvArray[(vertexOffset * 2) + 2] = v2.x;
            uvArray[(vertexOffset * 2) + 3] = 1.0 - v2.y;
            // Third vertex UVs (RESTORE D20 Y-FLIP)
            uvArray[(vertexOffset * 2) + 4] = v3.x;
            uvArray[(vertexOffset * 2) + 5] = 1.0 - v3.y;
        }
        // Mark UV attribute as needing update
        uvAttribute.needsUpdate = true;
        console.log(`Applied triangle UV mapping with equilateral triangles for ${faceCount} faces`);
    }
    applyTetrahedronUVMapping(geometry) {
        // Convert to non-indexed geometry for proper UV mapping
        const nonIndexedGeometry = geometry.toNonIndexed();
        geometry.attributes = nonIndexedGeometry.attributes;
        geometry.index = null;
        console.log('Applying tetrahedron UV mapping for D4');
        const uvAttribute = geometry.attributes.uv;
        const uvArray = uvAttribute.array;
        // D4 has exactly 4 triangular faces in a 2x2 grid
        const cols = 2;
        const rows = 2;
        const cellWidth = 1.0 / cols;
        const cellHeight = 1.0 / rows;
        // TetrahedronGeometry has 4 triangular faces
        for (let faceIndex = 0; faceIndex < 4; faceIndex++) {
            const col = faceIndex % cols;
            const row = Math.floor(faceIndex / cols);
            // Equilateral triangles that use full grid cell width
            const cellLeft = col * cellWidth;
            const cellRight = (col + 1) * cellWidth;
            const cellTop = row * cellHeight;
            const cellBottom = (row + 1) * cellHeight;
            const cellCenterX = (cellLeft + cellRight) / 2;
            const cellCenterY = (cellTop + cellBottom) / 2;
            // Equilateral triangle with base = full cell width
            const triangleBase = cellWidth;
            const triangleHeight = triangleBase * Math.sqrt(3) / 2; // Height of equilateral triangle
            // Center the triangle vertically in the cell
            const topX = cellCenterX;
            const topY = cellCenterY - triangleHeight / 2;
            const leftX = cellLeft;
            const leftY = cellCenterY + triangleHeight / 2;
            const rightX = cellRight;
            const rightY = cellCenterY + triangleHeight / 2;
            // Set UV coordinates for the three vertices of this face
            const vertexOffset = faceIndex * 3;
            // First vertex UVs (top vertex)
            uvArray[(vertexOffset * 2)] = topX;
            uvArray[(vertexOffset * 2) + 1] = topY;
            // Second vertex UVs (left vertex)
            uvArray[(vertexOffset * 2) + 2] = leftX;
            uvArray[(vertexOffset * 2) + 3] = leftY;
            // Third vertex UVs (right vertex)
            uvArray[(vertexOffset * 2) + 4] = rightX;
            uvArray[(vertexOffset * 2) + 5] = rightY;
        }
        uvAttribute.needsUpdate = true;
        console.log('Applied simple tetrahedron UV mapping for D4 with full grid cells');
    }
    applySquareUVMapping(geometry) {
        // BoxGeometry has 6 faces, each with 2 triangles (12 triangles total)
        const uvAttribute = geometry.attributes.uv;
        const uvArray = uvAttribute.array;
        console.log('Applying square UV mapping for D6');
        // Define UV layout in a 3x2 grid for 6 faces to match template
        const cols = 3;
        const rows = 2;
        const cellWidth = 1.0 / cols;
        const cellHeight = 1.0 / rows;
        const padding = 0.02;
        // BoxGeometry face order: right, left, top, bottom, front, back
        // Template grid layout:
        // Row 0: [0-right, 1-left, 2-top]
        // Row 1: [3-bottom, 4-front, 5-back]
        for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
            const col = faceIndex % cols;
            const row = Math.floor(faceIndex / cols);
            const cellLeft = col * cellWidth + padding;
            const cellRight = (col + 1) * cellWidth - padding;
            const cellTop = row * cellHeight + padding;
            const cellBottom = (row + 1) * cellHeight - padding;
            // Each face has 2 triangles with 3 vertices each = 6 vertices
            // BoxGeometry uses 4 unique vertices per face with shared vertices for triangles
            const faceVertexStart = faceIndex * 4;
            // For each face, set UV coordinates for the 4 vertices
            // Fix mirroring by using correct orientation
            const uvCoords = [
                [cellLeft, cellBottom],
                [cellRight, cellBottom],
                [cellLeft, cellTop],
                [cellRight, cellTop] // Top-right
            ];
            // Apply UV coordinates to each vertex of this face
            for (let vertexIndex = 0; vertexIndex < 4; vertexIndex++) {
                const uvIndex = (faceVertexStart + vertexIndex) * 2;
                uvArray[uvIndex] = uvCoords[vertexIndex][0]; // U coordinate
                uvArray[uvIndex + 1] = uvCoords[vertexIndex][1]; // V coordinate
            }
        }
        uvAttribute.needsUpdate = true;
        console.log('Applied square UV mapping for D6 with 3x2 grid layout');
    }
    applyD12PentagonUVMapping(geometry) {
        // Convert to non-indexed geometry so each triangle has its own vertices
        const nonIndexedGeometry = geometry.toNonIndexed();
        geometry.attributes = nonIndexedGeometry.attributes;
        geometry.index = null;
        const uvAttribute = geometry.attributes.uv;
        const uvArray = uvAttribute.array;
        console.log('Applying D12 pentagon UV mapping for 4x3 grid');
        const totalTriangles = uvAttribute.count / 3;
        console.log(`D12: ${totalTriangles} triangles total`);
        // 4x3 grid for 12 pentagon faces on 1024x1024 image
        const cols = 4;
        const rows = 3;
        const cellWidth = 1.0 / cols;
        const cellHeight = 1.0 / rows;
        const padding = 0.02;
        // DodecahedronGeometry creates 60 triangles (5 per face for center-based triangulation)
        const trianglesPerFace = totalTriangles / 12;
        console.log(`Triangles per face: ${trianglesPerFace}`);
        // Process each pentagon face
        for (let faceIndex = 0; faceIndex < 12; faceIndex++) {
            // Calculate grid position
            const col = faceIndex % cols;
            const row = Math.floor(faceIndex / cols);
            // Calculate cell bounds with padding
            const cellLeft = col * cellWidth + padding;
            const cellRight = (col + 1) * cellWidth - padding;
            const cellTop = row * cellHeight + padding;
            const cellBottom = (row + 1) * cellHeight - padding;
            const cellCenterX = (cellLeft + cellRight) / 2;
            const cellCenterY = (cellTop + cellBottom) / 2;
            const cellW = cellRight - cellLeft;
            const cellH = cellBottom - cellTop;
            const pentagonRadius = Math.min(cellW, cellH) * 0.4;
            // Generate pentagon vertices: v1 at top, then clockwise v2, v3, v4, v5
            const pentagonVertices = [];
            for (let i = 0; i < 5; i++) {
                // Start from top (-90°) and go clockwise
                const angle = (i * 2 * Math.PI) / 5 - Math.PI / 2 + (Math.PI / 5);
                pentagonVertices.push({
                    x: cellCenterX + Math.cos(angle) * pentagonRadius,
                    y: cellCenterY + Math.sin(angle) * pentagonRadius
                });
            }
            // Now pentagonVertices[0] = v1 (top)
            // pentagonVertices[1] = v2 (clockwise from v1)
            // pentagonVertices[2] = v3 (clockwise from v2)
            // pentagonVertices[3] = v4 (clockwise from v3)
            // pentagonVertices[4] = v5 (clockwise from v4)
            // Map triangles for this face
            const baseTriangle = Math.floor(faceIndex * trianglesPerFace);
            const endTriangle = Math.floor((faceIndex + 1) * trianglesPerFace);
            for (let triangleIdx = baseTriangle; triangleIdx < endTriangle && triangleIdx < totalTriangles; triangleIdx++) {
                const localTriangle = triangleIdx - baseTriangle;
                const vertexOffset = triangleIdx * 3;
                const uvIndex = vertexOffset * 2;
                if (trianglesPerFace === 5) {
                    // 5 triangles per face: fan from center
                    // Each triangle goes from center to two consecutive vertices
                    const v1 = { x: cellCenterX, y: cellCenterY }; // Center
                    const v2 = pentagonVertices[localTriangle % 5];
                    const v3 = pentagonVertices[(localTriangle + 1) % 5];
                    uvArray[uvIndex] = v1.x;
                    uvArray[uvIndex + 1] = v1.y;
                    uvArray[uvIndex + 2] = v2.x;
                    uvArray[uvIndex + 3] = v2.y;
                    uvArray[uvIndex + 4] = v3.x;
                    uvArray[uvIndex + 5] = v3.y;
                }
                else if (trianglesPerFace === 3) {
                    // 3 triangles per face: fan from v1 (top vertex)
                    if (localTriangle === 0) {
                        // Third triangle: v1, v4, v5
                        uvArray[uvIndex] = pentagonVertices[4].x; // v1 (top)
                        uvArray[uvIndex + 1] = pentagonVertices[4].y;
                        uvArray[uvIndex + 2] = pentagonVertices[0].x; // v4
                        uvArray[uvIndex + 3] = pentagonVertices[0].y;
                        uvArray[uvIndex + 4] = pentagonVertices[3].x; // v5
                        uvArray[uvIndex + 5] = pentagonVertices[3].y;
                    }
                    else if (localTriangle === 1) {
                        // Second triangle: v1, v3, v4
                        uvArray[uvIndex] = pentagonVertices[2].x; // v1 (top)
                        uvArray[uvIndex + 1] = pentagonVertices[2].y;
                        uvArray[uvIndex + 2] = pentagonVertices[3].x; // v3
                        uvArray[uvIndex + 3] = pentagonVertices[3].y;
                        uvArray[uvIndex + 4] = pentagonVertices[0].x; // v4
                        uvArray[uvIndex + 5] = pentagonVertices[0].y;
                    }
                    else if (localTriangle === 2) {
                        // First triangle: v1, v2, v3
                        uvArray[uvIndex] = pentagonVertices[0].x; // v1 (top)
                        uvArray[uvIndex + 1] = pentagonVertices[0].y;
                        uvArray[uvIndex + 2] = pentagonVertices[1].x; // v2 (clockwise from v1)
                        uvArray[uvIndex + 3] = pentagonVertices[1].y;
                        uvArray[uvIndex + 4] = pentagonVertices[2].x; // v3 (clockwise from v2)
                        uvArray[uvIndex + 5] = pentagonVertices[2].y;
                    }
                }
                else {
                    // Fallback: distribute triangles around pentagon
                    const angle = (localTriangle / trianglesPerFace) * Math.PI * 2;
                    const nextAngle = ((localTriangle + 1) / trianglesPerFace) * Math.PI * 2;
                    uvArray[uvIndex] = cellCenterX;
                    uvArray[uvIndex + 1] = cellCenterY;
                    uvArray[uvIndex + 2] = cellCenterX + Math.cos(angle) * pentagonRadius;
                    uvArray[uvIndex + 3] = cellCenterY + Math.sin(angle) * pentagonRadius;
                    uvArray[uvIndex + 4] = cellCenterX + Math.cos(nextAngle) * pentagonRadius;
                    uvArray[uvIndex + 5] = cellCenterY + Math.sin(nextAngle) * pentagonRadius;
                }
            }
        }
        uvAttribute.needsUpdate = true;
        console.log('Applied adaptive D12 pentagon UV mapping');
    }
    // ============================================================================
    // MULTI-DICE HELPER METHODS
    // ============================================================================
    getFaceCountForDiceType(diceType) {
        switch (diceType) {
            case 'd4': return 4;
            case 'd6': return 6;
            case 'd8': return 8;
            case 'd10': return 10;
            case 'd12': return 12;
            case 'd20': return 20;
            default: return 20;
        }
    }
    createSingleDice(diceType) {
        // Create geometry based on dice type
        const geometry = this.createGeometryForDiceType(diceType);
        // Apply UV mapping
        this.applyUVMappingForDiceType(geometry, diceType);
        // Create material with individual scaling
        const material = this.createMaterialForDiceType(diceType);
        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        // Position dice to prevent overlapping
        const position = this.getNextDicePosition();
        mesh.position.copy(position);
        // Create physics body
        const body = this.createPhysicsBodyForDiceType(diceType);
        body.position.set(position.x, position.y, position.z);
        // Add to scene and world
        this.scene.add(mesh);
        this.world.addBody(body);
        // Debug: Verify body is in world with correct damping
        console.log(`🔍 Body added to world. In world: ${this.world.bodies.includes(body)}, damping: linear=${body.linearDamping}, angular=${body.angularDamping}`);
        // Add to tracking arrays
        this.diceArray.push(mesh);
        this.diceBodyArray.push(body);
        this.diceTypeArray.push(diceType);
        console.log(`Created ${diceType} dice. Total dice: ${this.diceArray.length}`);
    }
    createGeometryForDiceType(diceType) {
        const baseSize = this.settings.diceSize;
        const scale = this.settings.diceScales[diceType] || 1.0;
        const size = baseSize * scale;
        switch (diceType) {
            case 'd4':
                return new THREE.TetrahedronGeometry(size, 0);
            case 'd6':
                return new THREE.BoxGeometry(size * 2, size * 2, size * 2);
            case 'd8':
                return new THREE.OctahedronGeometry(size, 0);
            case 'd10':
                return this.createD10PolyhedronGeometry(size);
            case 'd12':
                return new THREE.DodecahedronGeometry(size, 0);
            case 'd20':
            default:
                return new THREE.IcosahedronGeometry(size, 0);
        }
    }
    applyUVMappingForDiceType(geometry, diceType) {
        switch (diceType) {
            case 'd4':
                this.applyTriangleUVMapping(geometry, 4);
                break;
            case 'd6':
                this.applySquareUVMapping(geometry);
                break;
            case 'd8':
                this.applyTriangleUVMapping(geometry, 8);
                break;
            case 'd10':
                this.applyD10UVMapping(geometry);
                break;
            case 'd12':
                this.applyD12PentagonUVMapping(geometry);
                break;
            case 'd20':
            default:
                this.applyTriangleUVMapping(geometry, 20);
                break;
        }
    }
    createMaterialForDiceType(diceType) {
        const materialProps = {
            color: this.settings.diceColor,
            shininess: this.settings.diceShininess,
            specular: this.settings.diceSpecular,
            transparent: this.settings.diceTransparent,
            opacity: this.settings.diceOpacity
        };
        // Apply dice texture if available
        const textureData = this.getDiceTextureDataForType(diceType);
        if (textureData) {
            const texture = this.loadTextureFromData(textureData);
            if (texture) {
                materialProps.map = texture;
            }
        }
        // Apply normal map if available
        const normalMapData = this.getDiceNormalMapDataForType(diceType);
        if (normalMapData) {
            const normalMap = this.loadNormalMapFromData(normalMapData);
            if (normalMap) {
                materialProps.normalMap = normalMap;
            }
        }
        const material = new THREE.MeshPhongMaterial(materialProps);
        // Configure shadow properties based on settings
        material.castShadow = this.settings.diceCastShadow;
        material.receiveShadow = this.settings.diceReceiveShadow;
        return material;
    }
    getDiceTextureDataForType(diceType) {
        return this.settings.diceTextures[diceType] || null;
    }
    getDiceNormalMapDataForType(diceType) {
        return this.settings.diceNormalMaps[diceType] || null;
    }
    loadTextureFromData(textureData) {
        try {
            const loader = new THREE.TextureLoader();
            const texture = loader.load(textureData);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            return texture;
        }
        catch (error) {
            console.warn('Failed to load dice texture:', error);
            return null;
        }
    }
    loadNormalMapFromData(normalMapData) {
        try {
            const loader = new THREE.TextureLoader();
            const normalMap = loader.load(normalMapData);
            normalMap.wrapS = THREE.RepeatWrapping;
            normalMap.wrapT = THREE.RepeatWrapping;
            return normalMap;
        }
        catch (error) {
            console.warn('Failed to load dice normal map:', error);
            return null;
        }
    }
    createPhysicsBodyForDiceType(diceType) {
        var _a, _b;
        const baseSize = this.settings.diceSize;
        const scale = this.settings.diceScales[diceType] || 1.0;
        const size = baseSize * scale;
        // Create proper physics shape based on dice type
        const shape = this.createPhysicsShapeForDiceType(diceType, size);
        const body = new CANNON.Body({
            mass: 1,
            material: new CANNON.Material({
                friction: 0.4,
                restitution: 0.3
            })
        });
        body.addShape(shape);
        body.linearDamping = 0.1; // Normal damping
        body.angularDamping = 0.1; // Normal damping
        // Debug: Log the physics parameters to confirm they're applied
        console.log(`🎲 Created dice body: mass=${body.mass}, friction=${(_a = body.material) === null || _a === void 0 ? void 0 : _a.friction}, restitution=${(_b = body.material) === null || _b === void 0 ? void 0 : _b.restitution}, linearDamping=${body.linearDamping}, angularDamping=${body.angularDamping}`);
        // Enable sleeping for better performance
        body.allowSleep = true;
        body.sleepSpeedLimit = 0.1;
        body.sleepTimeLimit = 1;
        return body;
    }
    createPhysicsShapeForDiceType(diceType, size) {
        switch (diceType) {
            case 'd6':
                // D6 uses box shape for proper cube physics
                console.log(`🔷 Creating Box physics shape for ${diceType}`);
                return new CANNON.Box(new CANNON.Vec3(size, size, size));
            case 'd4':
            case 'd8':
            case 'd10':
            case 'd12':
            case 'd20':
                // For complex shapes, create convex polyhedron from geometry
                console.log(`🔸 Creating ConvexPolyhedron physics shape for ${diceType}`);
                const geometry = this.createGeometryForDiceType(diceType);
                const convexShape = this.createConvexPolyhedronFromGeometry(geometry);
                geometry.dispose(); // Clean up geometry after creating physics shape
                return convexShape;
            default:
                // Fallback to sphere for unknown dice types
                console.warn(`⚠️ Unknown dice type ${diceType}, using sphere shape`);
                return new CANNON.Sphere(size);
        }
    }
    getNextDicePosition() {
        const gridSize = 2.5; // Space between dice
        const cols = 8; // Dice per row
        const totalDice = this.diceArray.length;
        const col = totalDice % cols;
        const row = Math.floor(totalDice / cols);
        return new THREE.Vector3((col - cols / 2) * gridSize, this.floorHeight + 2, // Start above floor
        (row - 2) * gridSize);
    }
    clearAllDice() {
        // Remove all dice from scene
        for (const mesh of this.diceArray) {
            this.scene.remove(mesh);
            if (mesh.geometry)
                mesh.geometry.dispose();
            if (mesh.material && !Array.isArray(mesh.material)) {
                mesh.material.dispose();
            }
        }
        // Remove all physics bodies
        for (const body of this.diceBodyArray) {
            this.world.removeBody(body);
        }
        // Clear arrays
        this.diceArray.length = 0;
        this.diceBodyArray.length = 0;
        this.diceTypeArray.length = 0;
        this.selectedDice.length = 0;
        this.draggedDiceIndex = -1;
    }
    removeSingleDice(diceType) {
        // Find the last dice of the specified type
        for (let i = this.diceTypeArray.length - 1; i >= 0; i--) {
            if (this.diceTypeArray[i] === diceType) {
                // Remove from scene
                const mesh = this.diceArray[i];
                this.scene.remove(mesh);
                if (mesh.geometry)
                    mesh.geometry.dispose();
                if (mesh.material && !Array.isArray(mesh.material)) {
                    mesh.material.dispose();
                }
                // Remove physics body
                const body = this.diceBodyArray[i];
                this.world.removeBody(body);
                // Remove from arrays
                this.diceArray.splice(i, 1);
                this.diceBodyArray.splice(i, 1);
                this.diceTypeArray.splice(i, 1);
                // Update selectedDice array
                this.selectedDice = this.selectedDice.filter(index => index !== i);
                this.selectedDice = this.selectedDice.map(index => index > i ? index - 1 : index);
                // Update draggedDiceIndex
                if (this.draggedDiceIndex === i) {
                    this.draggedDiceIndex = -1;
                }
                else if (this.draggedDiceIndex > i) {
                    this.draggedDiceIndex--;
                }
                return true; // Successfully removed
            }
        }
        return false; // No dice of this type found
    }
    getRandomResultForDiceType(diceType) {
        const faceCount = this.getFaceCountForDiceType(diceType);
        return Math.floor(Math.random() * faceCount) + 1;
    }
    checkSingleDiceSettling(diceIndex) {
        if (!this.isRolling || diceIndex < 0 || diceIndex >= this.diceBodyArray.length)
            return;
        const body = this.diceBodyArray[diceIndex];
        const motionThreshold = this.settings.motionThreshold;
        const velocityThreshold = 0.05 / motionThreshold;
        const angularThreshold = 0.5 / motionThreshold;
        const velocity = body.velocity.length();
        const angularVelocity = body.angularVelocity.length();
        const isSettled = velocity <= velocityThreshold &&
            angularVelocity <= angularThreshold &&
            body.position.y <= -0.5;
        if (isSettled) {
            console.log(`🎲 Single dice ${diceIndex} settled`);
            this.completeSingleDiceRoll(diceIndex);
        }
        else {
            // Check again in 100ms
            setTimeout(() => this.checkSingleDiceSettling(diceIndex), 100);
        }
    }
    completeSingleDiceRoll(diceIndex) {
        if (this.rollTimeout) {
            clearTimeout(this.rollTimeout);
            this.rollTimeout = null;
        }
        const diceType = this.diceTypeArray[diceIndex];
        // Wait 2 seconds before checking result to match multi-dice behavior
        setTimeout(() => {
            // Check if dice can be properly detected
            const checkResult = this.checkDiceResult(diceIndex);
            let formattedResult;
            if (checkResult.isCaught) {
                // Dice is caught - highlight it and show in result
                this.highlightCaughtDice(diceIndex, true);
                formattedResult = `1${diceType}(CAUGHT) = CAUGHT - Face confidence: ${checkResult.confidence.toFixed(3)}, required: ${checkResult.requiredConfidence.toFixed(3)}`;
                console.log(`🥅 Single dice ${diceIndex} (${diceType}) CAUGHT! Face confidence: ${checkResult.confidence.toFixed(3)}, required: ${checkResult.requiredConfidence.toFixed(3)}`);
            }
            else {
                // Valid result
                formattedResult = `1${diceType}(${checkResult.result}) = ${checkResult.result}`;
                console.log(`📊 Single dice roll result: ${formattedResult}`);
            }
            this.isRolling = false;
            // Trigger the onRollComplete callback with formatted result
            if (this.onRollComplete) {
                this.onRollComplete(formattedResult);
            }
        }, 2000);
    }
    checkMultiDiceSettling() {
        if (!this.isRolling)
            return;
        // Check if all dice have settled
        let allSettled = true;
        const motionThreshold = this.settings.motionThreshold;
        const velocityThreshold = 0.05 / motionThreshold;
        const angularThreshold = 0.5 / motionThreshold;
        for (let i = 0; i < this.diceBodyArray.length; i++) {
            const body = this.diceBodyArray[i];
            const velocity = body.velocity.length();
            const angularVelocity = body.angularVelocity.length();
            if (velocity > velocityThreshold || angularVelocity > angularThreshold || body.position.y > -0.5) {
                allSettled = false;
                // Debug logging (only for first few checks to avoid spam)
                if (Math.random() < 0.02) { // Log 2% of the time
                    console.log(`Dice ${i} not settled:`, {
                        velocity: velocity.toFixed(3),
                        angularVelocity: angularVelocity.toFixed(3),
                        positionY: body.position.y.toFixed(3),
                        velocityThreshold: velocityThreshold.toFixed(3),
                        angularThreshold: angularThreshold.toFixed(3),
                        velocityOK: velocity <= velocityThreshold,
                        angularOK: angularVelocity <= angularThreshold,
                        positionOK: body.position.y <= -0.5
                    });
                }
                break;
            }
        }
        if (allSettled) {
            console.log('🎲 All dice motion thresholds met - completing roll');
            // Complete the roll immediately once settled
            this.completeMultiRoll();
        }
        else {
            // Check again in 100ms
            setTimeout(() => this.checkMultiDiceSettling(), 100);
        }
    }
    completeMultiRoll() {
        // Clear timeout if it exists
        if (this.rollTimeoutId) {
            clearTimeout(this.rollTimeoutId);
            this.rollTimeoutId = null;
        }
        console.log('✅ All dice settled - calculating results');
        // Calculate results for all dice using physics-based face detection
        const results = {};
        let totalSum = 0;
        for (let i = 0; i < this.diceArray.length; i++) {
            const diceType = this.diceTypeArray[i];
            const result = this.getTopFaceNumberForDice(i);
            if (!results[diceType]) {
                results[diceType] = [];
            }
            results[diceType].push(result);
            totalSum += result;
        }
        // Format the result string
        const formattedResult = this.formatRollResults(results, totalSum);
        console.log(`📊 Final roll result: ${formattedResult}`);
        this.isRolling = false;
        if (this.rollTimeout) {
            clearTimeout(this.rollTimeout);
            this.rollTimeout = null;
        }
        // Also trigger the onRollComplete callback with formatted result
        if (this.onRollComplete) {
            this.onRollComplete(formattedResult);
        }
        if (this.multiRollResolve) {
            this.multiRollResolve(formattedResult);
            this.multiRollResolve = null;
        }
    }
    forceStopMultiRoll() {
        console.log('⏰ Force stopping multi-dice roll due to timeout');
        this.completeMultiRoll();
    }
    // Check if dice can be determined, or if it's caught
    checkDiceResult(diceIndex) {
        const diceType = this.diceTypeArray[diceIndex];
        const diceMesh = this.diceArray[diceIndex];
        if (!diceMesh) {
            return { isCaught: false, result: this.getRandomResultForDiceType(diceType), confidence: 0, requiredConfidence: 0 };
        }
        // Get face normals for this dice type
        const faceNormals = this.getFaceNormalsForDiceType(diceType);
        // Detection vector based on dice type
        const detectionVector = diceType === 'd4'
            ? new THREE.Vector3(0, -1, 0) // Down vector for D4
            : new THREE.Vector3(0, 1, 0); // Up vector for others
        let bestDotProduct = -Infinity;
        let bestFaceIndex = 0;
        // Check each face normal to find which face is pointing up/down
        for (let i = 0; i < faceNormals.length; i++) {
            // Transform face normal to world space using dice rotation
            const worldNormal = faceNormals[i].clone();
            worldNormal.applyQuaternion(diceMesh.quaternion);
            // Calculate dot product with detection vector
            const dotProduct = worldNormal.dot(detectionVector);
            if (dotProduct > bestDotProduct) {
                bestDotProduct = dotProduct;
                bestFaceIndex = i;
            }
        }
        // Check if the best face meets the confidence threshold
        const minConfidenceForValidFace = 1.0 - this.settings.faceDetectionTolerance;
        const isCaught = bestDotProduct < minConfidenceForValidFace;
        if (isCaught) {
            // Face detection failed - dice is caught
            return {
                isCaught: true,
                result: null,
                confidence: bestDotProduct,
                requiredConfidence: minConfidenceForValidFace
            };
        }
        else {
            // Face detection succeeded - return the result
            const result = this.mapFaceIndexToNumber(bestFaceIndex, diceType);
            console.log(`🎯 Dice ${diceIndex} (${diceType}) face detection: face index ${bestFaceIndex} = ${result}, confidence: ${bestDotProduct.toFixed(3)}`);
            return {
                isCaught: false,
                result: result,
                confidence: bestDotProduct,
                requiredConfidence: minConfidenceForValidFace
            };
        }
    }
    getTopFaceNumberForDice(diceIndex) {
        // Use the unified checkDiceResult method to perform face detection
        const checkResult = this.checkDiceResult(diceIndex);
        // Just return the result (or fallback if caught)
        // Note: Caught checking/highlighting is handled separately in monitoring code
        if (checkResult.isCaught) {
            return this.getRandomResultForDiceType(this.diceTypeArray[diceIndex]);
        }
        return checkResult.result;
    }
    getFaceNormalsForDiceType(diceType) {
        switch (diceType) {
            case 'd4':
                // THREE.js TetrahedronGeometry creates a regular tetrahedron with vertices:
                // v0: (1, 1, 1), v1: (-1, -1, 1), v2: (-1, 1, -1), v3: (1, -1, -1)
                // Center is at (0, 0, 0)
                // The actual face structure from THREE.js TetrahedronGeometry:
                // Looking at the source, faces are created as:
                // Face 0: (2, 3, 0) - contains vertices v2, v3, v0
                // Face 1: (0, 3, 1) - contains vertices v0, v3, v1
                // Face 2: (1, 3, 2) - contains vertices v1, v3, v2
                // Face 3: (2, 0, 1) - contains vertices v2, v0, v1
                const v0 = new THREE.Vector3(1, 1, 1);
                const v1 = new THREE.Vector3(-1, -1, 1);
                const v2 = new THREE.Vector3(-1, 1, -1);
                const v3 = new THREE.Vector3(1, -1, -1);
                // Calculate face centers to ensure normals point outward
                const center = new THREE.Vector3(0, 0, 0);
                // Face 0: vertices 2, 3, 0
                const face0Center = new THREE.Vector3().addVectors(v2, v3).add(v0).divideScalar(3);
                const e0_1 = new THREE.Vector3().subVectors(v3, v2);
                const e0_2 = new THREE.Vector3().subVectors(v0, v2);
                let n0 = new THREE.Vector3().crossVectors(e0_1, e0_2).normalize();
                // Ensure normal points outward
                if (n0.dot(face0Center.clone().sub(center)) < 0)
                    n0.negate();
                // Face 1: vertices 0, 3, 1
                const face1Center = new THREE.Vector3().addVectors(v0, v3).add(v1).divideScalar(3);
                const e1_1 = new THREE.Vector3().subVectors(v3, v0);
                const e1_2 = new THREE.Vector3().subVectors(v1, v0);
                let n1 = new THREE.Vector3().crossVectors(e1_1, e1_2).normalize();
                if (n1.dot(face1Center.clone().sub(center)) < 0)
                    n1.negate();
                // Face 2: vertices 1, 3, 2
                const face2Center = new THREE.Vector3().addVectors(v1, v3).add(v2).divideScalar(3);
                const e2_1 = new THREE.Vector3().subVectors(v3, v1);
                const e2_2 = new THREE.Vector3().subVectors(v2, v1);
                let n2 = new THREE.Vector3().crossVectors(e2_1, e2_2).normalize();
                if (n2.dot(face2Center.clone().sub(center)) < 0)
                    n2.negate();
                // Face 3: vertices 2, 0, 1
                const face3Center = new THREE.Vector3().addVectors(v2, v0).add(v1).divideScalar(3);
                const e3_1 = new THREE.Vector3().subVectors(v0, v2);
                const e3_2 = new THREE.Vector3().subVectors(v1, v2);
                let n3 = new THREE.Vector3().crossVectors(e3_1, e3_2).normalize();
                if (n3.dot(face3Center.clone().sub(center)) < 0)
                    n3.negate();
                console.log('D4 Face normals calculated:');
                console.log(`  Face 0 (value 1): (${n0.x.toFixed(3)}, ${n0.y.toFixed(3)}, ${n0.z.toFixed(3)})`);
                console.log(`  Face 1 (value 2): (${n1.x.toFixed(3)}, ${n1.y.toFixed(3)}, ${n1.z.toFixed(3)})`);
                console.log(`  Face 2 (value 3): (${n2.x.toFixed(3)}, ${n2.y.toFixed(3)}, ${n2.z.toFixed(3)})`);
                console.log(`  Face 3 (value 4): (${n3.x.toFixed(3)}, ${n3.y.toFixed(3)}, ${n3.z.toFixed(3)})`);
                return [n0, n1, n2, n3];
            case 'd6':
                // Box/Cube face normals
                return [
                    new THREE.Vector3(1, 0, 0),
                    new THREE.Vector3(-1, 0, 0),
                    new THREE.Vector3(0, 1, 0),
                    new THREE.Vector3(0, -1, 0),
                    new THREE.Vector3(0, 0, 1),
                    new THREE.Vector3(0, 0, -1) // Back
                ];
            case 'd8':
                // Octahedron face normals
                const oct = 1 / Math.sqrt(3);
                return [
                    new THREE.Vector3(oct, oct, oct),
                    new THREE.Vector3(-oct, oct, oct),
                    new THREE.Vector3(-oct, -oct, oct),
                    new THREE.Vector3(oct, -oct, oct),
                    new THREE.Vector3(oct, oct, -oct),
                    new THREE.Vector3(-oct, oct, -oct),
                    new THREE.Vector3(-oct, -oct, -oct),
                    new THREE.Vector3(oct, -oct, -oct)
                ];
            case 'd10':
                // D10 face normals (kite-shaped faces)
                const normals = [];
                for (let i = 0; i < 10; i++) {
                    const angle = (i * 2 * Math.PI / 10);
                    const normal = new THREE.Vector3(Math.cos(angle), 0.3, // Slight upward angle
                    Math.sin(angle)).normalize();
                    normals.push(normal);
                }
                return normals;
            case 'd12':
                // Dodecahedron face normals (12 pentagonal faces)
                const phi = (1 + Math.sqrt(5)) / 2;
                const invPhi = 1 / phi;
                return [
                    new THREE.Vector3(0, phi, invPhi).normalize(),
                    new THREE.Vector3(invPhi, phi, 0).normalize(),
                    new THREE.Vector3(invPhi, 0, phi).normalize(),
                    new THREE.Vector3(-invPhi, 0, phi).normalize(),
                    new THREE.Vector3(-invPhi, phi, 0).normalize(),
                    new THREE.Vector3(0, invPhi, phi).normalize(),
                    new THREE.Vector3(0, phi, -invPhi).normalize(),
                    new THREE.Vector3(invPhi, 0, -phi).normalize(),
                    new THREE.Vector3(0, -invPhi, -phi).normalize(),
                    new THREE.Vector3(0, -phi, -invPhi).normalize(),
                    new THREE.Vector3(-invPhi, 0, -phi).normalize(),
                    new THREE.Vector3(0, -phi, invPhi).normalize()
                ];
            case 'd20':
                // Icosahedron face normals (20 triangular faces)
                const t = (1 + Math.sqrt(5)) / 2;
                const vertices = [
                    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
                    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
                    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
                ];
                const faces = [
                    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
                    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
                    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
                    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
                ];
                return faces.map(face => {
                    const v1 = new THREE.Vector3(...vertices[face[0]]);
                    const v2 = new THREE.Vector3(...vertices[face[1]]);
                    const v3 = new THREE.Vector3(...vertices[face[2]]);
                    const edge1 = v2.clone().sub(v1);
                    const edge2 = v3.clone().sub(v1);
                    return edge1.cross(edge2).normalize();
                });
            default:
                console.warn(`Unknown dice type ${diceType}, using default normals`);
                return [new THREE.Vector3(0, 1, 0)];
        }
    }
    mapFaceIndexToNumber(faceIndex, diceType) {
        // For most dice, face index directly maps to face number
        // Special cases can be handled here
        switch (diceType) {
            case 'd4':
                // D4 mapping: faces are numbered 1-4
                // The UV mapping puts faces in a 2x2 grid:
                // Face 0 (top-left) = 1, Face 1 (top-right) = 2
                // Face 2 (bottom-left) = 3, Face 3 (bottom-right) = 4
                return faceIndex + 1;
            case 'd6':
                // Standard d6 face mapping (1-6)
                const d6Map = [4, 3, 5, 2, 1, 6]; // Adjust based on UV layout
                return d6Map[faceIndex] || 1;
            case 'd8':
                // D8 mapping where opposite faces sum to 9
                // Octahedron opposite pairs based on face normals:
                // Index 0 (+,+,+) ↔ Index 6 (-,-,-) → 1 ↔ 8
                // Index 1 (-,+,+) ↔ Index 7 (+,-,-) → 2 ↔ 7
                // Index 2 (-,-,+) ↔ Index 4 (+,+,-) → 3 ↔ 6
                // Index 3 (+,-,+) ↔ Index 5 (-,+,-) → 4 ↔ 5
                const d8Map = [1, 2, 3, 4, 6, 5, 8, 7];
                return d8Map[faceIndex] || 1;
            case 'd10':
                // D10 uses 0-9 or 00-90
                return faceIndex; // 0-9
            case 'd20':
                // Standard icosahedron face mapping
                return (faceIndex % 20) + 1;
            default:
                // Default: face index + 1 gives face number
                return faceIndex + 1;
        }
    }
    formatRollResults(results, totalSum) {
        const resultParts = [];
        // Sort dice types for consistent output
        const sortedTypes = Object.keys(results).sort((a, b) => {
            const order = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
            return order.indexOf(a) - order.indexOf(b);
        });
        for (const diceType of sortedTypes) {
            const rolls = results[diceType];
            const rollsStr = rolls.join('+');
            resultParts.push(`${rolls.length}${diceType}(${rollsStr})`);
        }
        return `${resultParts.join(' + ')} = ${totalSum}`;
    }
    animateAllDice() {
        // Simple animation - just spin all dice
        for (let i = 0; i < this.diceArray.length; i++) {
            const dice = this.diceArray[i];
            const body = this.diceBodyArray[i];
            // Add random rotation
            dice.rotation.x += (Math.random() - 0.5) * 2;
            dice.rotation.y += (Math.random() - 0.5) * 2;
            dice.rotation.z += (Math.random() - 0.5) * 2;
            // Add small physics impulse for visual effect
            body.velocity.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2);
        }
    }
    // ============================================================================
    createPhysicsBody() {
        // DISABLED: Legacy single-dice physics body creation
        // Multi-dice system uses createPhysicsBodyForDiceType() instead
        console.log('createPhysicsBody() called but disabled for multi-dice system');
        return;
    }
    createConvexPolyhedronFromGeometry(geometry) {
        const workingGeometry = geometry.toNonIndexed();
        const positionAttribute = workingGeometry.attributes.position;
        if (!positionAttribute) {
            workingGeometry.dispose();
            throw new Error('Cannot create convex polyhedron: missing position attribute');
        }
        const vertices = [];
        const faces = [];
        const vertexMap = new Map();
        const addVertex = (vertex) => {
            const key = `${vertex.x.toFixed(5)}|${vertex.y.toFixed(5)}|${vertex.z.toFixed(5)}`;
            let index = vertexMap.get(key);
            if (index === undefined) {
                index = vertices.length;
                vertices.push(new CANNON.Vec3(vertex.x, vertex.y, vertex.z));
                vertexMap.set(key, index);
            }
            return index;
        };
        for (let i = 0; i < positionAttribute.count; i += 3) {
            const face = [];
            for (let j = 0; j < 3; j++) {
                const vertex = new THREE.Vector3().fromBufferAttribute(positionAttribute, i + j);
                face.push(addVertex(vertex));
            }
            faces.push(face);
        }
        workingGeometry.dispose();
        const shape = new CANNON.ConvexPolyhedron({ vertices, faces });
        shape.computeNormals();
        shape.updateBoundingSphereRadius();
        return shape;
    }
    initializeFaceNumbers() {
        // Initialize face numbers based on dice type
        const faceCount = this.getFaceCount();
        this.faceNumbers = [];
        for (let i = 0; i < faceCount; i++) {
            this.faceNumbers.push(i + 1);
        }
        console.log(`Initialized ${faceCount} face numbers for ${this.settings.diceType}:`, this.faceNumbers);
    }
    calculateFaceNormals() {
        console.log(`🔍 Calculating face normals for ${this.settings.diceType}...`);
        if (!this.diceGeometry) {
            console.error('Cannot calculate face normals: dice geometry not available');
            return;
        }
        this.faceNormals = [];
        const positionAttribute = this.diceGeometry.attributes.position;
        const faceCount = this.getFaceCount();
        // Handle different dice types
        switch (this.settings.diceType) {
            case 'd6':
                // For box geometry, we need to handle the fact that it has 6 faces but 12 triangles
                this.calculateBoxFaceNormals();
                break;
            case 'd10':
                this.calculateD10FaceNormals();
                break;
            case 'd12':
                // For dodecahedron, use the actual 12 pentagonal face normals
                this.calculateDodecahedronFaceNormals();
                break;
            default:
                // For other dice (d4, d8, d20), use triangle-based calculation
                const triangleCount = positionAttribute.count / 3;
                for (let i = 0; i < triangleCount; i++) {
                    const vertexIndex = i * 3;
                    // Get the three vertices of the face
                    const v1 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexIndex);
                    const v2 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexIndex + 1);
                    const v3 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexIndex + 2);
                    // Calculate two edge vectors
                    const edge1 = new THREE.Vector3().subVectors(v2, v1);
                    const edge2 = new THREE.Vector3().subVectors(v3, v1);
                    // Calculate face normal using cross product
                    const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
                    this.faceNormals.push(normal);
                }
                break;
        }
        console.log(`✅ Calculated ${this.faceNormals.length} face normals for ${this.settings.diceType}`);
        // Debug: log the first few normals
        for (let i = 0; i < Math.min(5, this.faceNormals.length); i++) {
            const normal = this.faceNormals[i];
            console.log(`Face ${i + 1} normal:`, normal.x.toFixed(3), normal.y.toFixed(3), normal.z.toFixed(3));
        }
    }
    calculateBoxFaceNormals() {
        // Box has 6 faces with specific normals
        this.faceNormals = [
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(0, -1, 0),
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 0, -1) // Back face
        ];
    }
    calculateCylinderFaceNormals() {
        // For d10, create normals for 10 faces around the cylinder
        this.faceNormals = [];
        const faceCount = this.getFaceCount();
        for (let i = 0; i < faceCount; i++) {
            const angle = (i * 2 * Math.PI / faceCount);
            const normal = new THREE.Vector3(Math.cos(angle), 0.3, // Slight upward angle for d10 shape
            Math.sin(angle)).normalize();
            this.faceNormals.push(normal);
        }
    }
    calculateDodecahedronFaceNormals() {
        // For D12, calculate the normals of the 12 actual pentagonal faces
        // Based on the physics body face definitions
        const phi = (1 + Math.sqrt(5)) / 2;
        const invPhi = 1 / phi;
        // Define the 12 pentagon face normals for a dodecahedron
        this.faceNormals = [
            new THREE.Vector3(0, phi, invPhi).normalize(),
            new THREE.Vector3(invPhi, phi, 0).normalize(),
            new THREE.Vector3(invPhi, 0, phi).normalize(),
            new THREE.Vector3(-invPhi, 0, phi).normalize(),
            new THREE.Vector3(-invPhi, phi, 0).normalize(),
            new THREE.Vector3(0, invPhi, phi).normalize(),
            new THREE.Vector3(0, phi, -invPhi).normalize(),
            new THREE.Vector3(invPhi, 0, -phi).normalize(),
            new THREE.Vector3(0, -invPhi, -phi).normalize(),
            new THREE.Vector3(0, -phi, -invPhi).normalize(),
            new THREE.Vector3(-invPhi, 0, -phi).normalize(),
            new THREE.Vector3(0, -phi, invPhi).normalize() // Face 12
        ];
    }
    calculateD10FaceNormals() {
        if (!this.diceGeometry) {
            return;
        }
        const positionAttribute = this.diceGeometry.attributes.position;
        if (!positionAttribute) {
            return;
        }
        this.faceNormals = [];
        // D10 has 10 faces, each made of 2 triangles (20 triangles total)
        const trianglesPerFace = 2;
        const totalTriangles = positionAttribute.count / 3;
        const totalFaces = 10;
        for (let faceIndex = 0; faceIndex < totalFaces; faceIndex++) {
            const baseTriangle = faceIndex * trianglesPerFace;
            if (baseTriangle < totalTriangles) {
                const vertexOffset = baseTriangle * 3;
                const v1 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexOffset);
                const v2 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexOffset + 1);
                const v3 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexOffset + 2);
                const edge1 = new THREE.Vector3().subVectors(v2, v1);
                const edge2 = new THREE.Vector3().subVectors(v3, v1);
                const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
                this.faceNormals.push(normal);
            }
        }
    }
    calculateTrapezohedronFaceNormals() {
        if (!this.diceGeometry) {
            return;
        }
        const positionAttribute = this.diceGeometry.attributes.position;
        if (!positionAttribute) {
            return;
        }
        this.faceNormals = [];
        const trianglesPerFace = 2;
        const verticesPerTriangle = 3;
        const faceVertexStride = trianglesPerFace * verticesPerTriangle;
        const totalFaces = positionAttribute.count / faceVertexStride;
        for (let faceIndex = 0; faceIndex < totalFaces; faceIndex++) {
            const vertexOffset = faceIndex * faceVertexStride;
            const v1 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexOffset);
            const v2 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexOffset + 1);
            const v3 = new THREE.Vector3().fromBufferAttribute(positionAttribute, vertexOffset + 2);
            const edge1 = new THREE.Vector3().subVectors(v2, v1);
            const edge2 = new THREE.Vector3().subVectors(v3, v1);
            const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
            this.faceNormals.push(normal);
        }
    }
    addDiceTextures() {
        if (!this.dice)
            return;
        // Try to load custom texture for current dice type
        const textureData = this.getCurrentDiceTextureData();
        let customTexture = null;
        if (textureData) {
            customTexture = this.loadCustomTexture(textureData);
        }
        // Try to load normal map for current dice type
        const normalMapData = this.getCurrentDiceNormalMapData();
        let normalMap = null;
        if (normalMapData) {
            normalMap = this.loadNormalMap(normalMapData);
        }
        // Create material with all configurable properties
        const materialProperties = {
            color: this.settings.diceColor,
            shininess: this.settings.diceShininess,
            specular: this.settings.diceSpecular,
            transparent: this.settings.diceTransparent,
            opacity: this.settings.diceOpacity
        };
        // Add texture if available
        if (customTexture) {
            materialProperties.map = customTexture;
            console.log(`Applied custom texture to ${this.settings.diceType} with color tint ${this.settings.diceColor}`);
        }
        else {
            console.log(`Using solid color material for ${this.settings.diceType}: ${this.settings.diceColor}`);
        }
        // Add normal map if available
        if (normalMap) {
            materialProperties.normalMap = normalMap;
            console.log(`Applied normal map to ${this.settings.diceType}`);
        }
        // Create and apply the material
        this.dice.material = new THREE.MeshPhongMaterial(materialProperties);
    }
    // Method to generate UV mapping template (for development/reference)
    generateUVTemplate() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return '';
        canvas.width = 512;
        canvas.height = 512;
        // D20 face colors and corresponding numbers
        const faceData = [
            { color: '#FF0000', number: 1 },
            { color: '#00FF00', number: 2 },
            { color: '#0000FF', number: 3 },
            { color: '#FFFF00', number: 4 },
            { color: '#FF00FF', number: 5 },
            { color: '#00FFFF', number: 6 },
            { color: '#FFA500', number: 7 },
            { color: '#800080', number: 8 },
            { color: '#FFC0CB', number: 9 },
            { color: '#A52A2A', number: 10 },
            { color: '#808080', number: 11 },
            { color: '#000000', number: 12 },
            { color: '#FFFFFF', number: 13 },
            { color: '#90EE90', number: 14 },
            { color: '#FFB6C1', number: 15 },
            { color: '#87CEEB', number: 16 },
            { color: '#DDA0DD', number: 17 },
            { color: '#F0E68C', number: 18 },
            { color: '#20B2AA', number: 19 },
            { color: '#DC143C', number: 20 } // Crimson
        ];
        // Create a 4x5 grid layout for 20 faces
        const gridCols = 4;
        const gridRows = 5;
        const cellWidth = 512 / gridCols;
        const cellHeight = 512 / gridRows;
        // Fill background
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, 512, 512);
        // Draw each face
        for (let i = 0; i < 20; i++) {
            const row = Math.floor(i / gridCols);
            const col = i % gridCols;
            const x = col * cellWidth;
            const y = row * cellHeight;
            // Fill the cell with the face color
            ctx.fillStyle = faceData[i].color;
            ctx.fillRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4);
            // Add face number
            ctx.fillStyle = faceData[i].color === '#000000' || faceData[i].color === '#800080' ? '#FFFFFF' : '#000000';
            ctx.font = 'bold 32px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(faceData[i].number.toString(), x + cellWidth / 2, y + cellHeight / 2);
            // Add small border
            ctx.strokeStyle = '#CCCCCC';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, cellWidth, cellHeight);
        }
        // Add title
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('D20 UV Mapping Template', 10, 25);
        return canvas.toDataURL('image/png');
    }
    // Method to log the color mapping for reference
    logColorMapping() {
        const colorMapping = [
            { face: 1, color: '#FF0000', name: 'Red' },
            { face: 2, color: '#00FF00', name: 'Green' },
            { face: 3, color: '#0000FF', name: 'Blue' },
            { face: 4, color: '#FFFF00', name: 'Yellow' },
            { face: 5, color: '#FF00FF', name: 'Magenta' },
            { face: 6, color: '#00FFFF', name: 'Cyan' },
            { face: 7, color: '#FFA500', name: 'Orange' },
            { face: 8, color: '#800080', name: 'Purple' },
            { face: 9, color: '#FFC0CB', name: 'Pink' },
            { face: 10, color: '#A52A2A', name: 'Brown' },
            { face: 11, color: '#808080', name: 'Gray' },
            { face: 12, color: '#000000', name: 'Black' },
            { face: 13, color: '#FFFFFF', name: 'White' },
            { face: 14, color: '#90EE90', name: 'Light Green' },
            { face: 15, color: '#FFB6C1', name: 'Light Pink' },
            { face: 16, color: '#87CEEB', name: 'Sky Blue' },
            { face: 17, color: '#DDA0DD', name: 'Plum' },
            { face: 18, color: '#F0E68C', name: 'Khaki' },
            { face: 19, color: '#20B2AA', name: 'Light Sea Green' },
            { face: 20, color: '#DC143C', name: 'Crimson' }
        ];
        console.log('🎲 D20 Face-to-Color Mapping:');
        console.table(colorMapping);
    }
    getCurrentDiceTextureData() {
        const textureMap = this.settings.diceTextures;
        if (textureMap) {
            const perType = textureMap[this.settings.diceType];
            if (perType && perType.trim() !== '') {
                return perType;
            }
        }
        return null;
    }
    getFaceCount() {
        switch (this.settings.diceType) {
            case 'd4': return 4;
            case 'd6': return 6;
            case 'd8': return 8;
            case 'd10': return 10;
            case 'd12': return 12;
            case 'd20': return 20;
            default: return 20;
        }
    }
    loadCustomTexture(textureData) {
        if (!textureData)
            return null;
        try {
            // Create image element to load the texture
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const texture = new THREE.Texture();
            texture.image = img;
            texture.wrapS = THREE.ClampToEdgeWrapping; // Use clamp for clean edges
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = false; // Disable mipmaps to reduce memory usage
            // Load the image
            img.onload = () => {
                texture.needsUpdate = true;
                console.log('Custom texture loaded successfully');
            };
            img.onerror = (error) => {
                console.error('Failed to load custom texture image:', error);
            };
            img.src = textureData;
            return texture;
        }
        catch (error) {
            console.error('Failed to load custom dice texture:', error);
            return null;
        }
    }
    getCurrentDiceNormalMapData() {
        // Check for per-dice-type normal map
        const diceType = this.settings.diceType;
        const normalMapData = this.settings.diceNormalMaps[diceType];
        if (normalMapData && normalMapData.trim() !== '') {
            return normalMapData;
        }
        return null;
    }
    loadNormalMap(normalMapData) {
        if (!normalMapData)
            return null;
        try {
            // Create image element to load the normal map
            const img = new Image();
            img.crossOrigin = 'anonymous';
            const normalMap = new THREE.Texture();
            normalMap.image = img;
            normalMap.wrapS = THREE.ClampToEdgeWrapping; // Use clamp for clean edges
            normalMap.wrapT = THREE.ClampToEdgeWrapping;
            normalMap.minFilter = THREE.LinearFilter;
            normalMap.magFilter = THREE.LinearFilter;
            normalMap.generateMipmaps = false; // Disable mipmaps to reduce memory usage
            // Load the image
            img.onload = () => {
                normalMap.needsUpdate = true;
                console.log('Normal map loaded successfully');
            };
            img.onerror = (error) => {
                console.error('Failed to load normal map image:', error);
            };
            img.src = normalMapData;
            return normalMap;
        }
        catch (error) {
            console.error('Failed to load normal map:', error);
            return null;
        }
    }
    setupLighting() {
        // Clear existing lights
        if (this.ambientLight) {
            this.scene.remove(this.ambientLight);
        }
        if (this.directionalLight) {
            this.scene.remove(this.directionalLight);
            if (this.directionalLight.target) {
                this.scene.remove(this.directionalLight.target);
            }
        }
        // Ambient light with configurable intensity and color
        this.ambientLight = new THREE.AmbientLight(new THREE.Color(this.settings.ambientLightColor), this.settings.ambientLightIntensity);
        this.scene.add(this.ambientLight);
        // Directional light with configurable properties
        this.directionalLight = new THREE.DirectionalLight(new THREE.Color(this.settings.directionalLightColor), this.settings.directionalLightIntensity);
        // Set configurable position
        this.directionalLight.position.set(this.settings.directionalLightPositionX, this.settings.directionalLightPositionY, this.settings.directionalLightPositionZ);
        // Target the center of the dice tray
        this.directionalLight.target.position.set(0, -2, 0);
        // Configure shadows if enabled
        this.directionalLight.castShadow = this.settings.enableShadows;
        if (this.settings.enableShadows) {
            // Configure shadow camera for optimal shadow quality
            this.directionalLight.shadow.camera.near = 0.1;
            this.directionalLight.shadow.camera.far = 100;
            this.directionalLight.shadow.camera.left = -20;
            this.directionalLight.shadow.camera.right = 20;
            this.directionalLight.shadow.camera.top = 20;
            this.directionalLight.shadow.camera.bottom = -20;
            // Higher resolution shadows
            this.directionalLight.shadow.mapSize.width = 2048;
            this.directionalLight.shadow.mapSize.height = 2048;
            // Soft shadow bias to reduce shadow acne
            this.directionalLight.shadow.bias = -0.0001;
        }
        this.scene.add(this.directionalLight);
        this.scene.add(this.directionalLight.target);
    }
    setupDragControls() {
        const canvas = this.renderer.domElement;
        // Set up events directly on canvas
        canvas.addEventListener('mousedown', (event) => this.onMouseDown(event));
        canvas.addEventListener('mouseup', (event) => this.onMouseUp(event));
        canvas.addEventListener('mousemove', (event) => this.onMouseMove(event));
        canvas.addEventListener('mouseleave', (event) => this.onMouseLeave(event));
        canvas.addEventListener('mouseenter', (event) => this.onMouseEnter(event));
        canvas.addEventListener('touchstart', (event) => this.onTouchStart(event));
        canvas.addEventListener('touchmove', (event) => this.onTouchMove(event));
        canvas.addEventListener('touchend', (event) => this.onTouchEnd(event));
        // Start with click-through enabled
        canvas.style.pointerEvents = 'none';
    }
    updateMousePosition(clientX, clientY) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }
    onMouseDown(event) {
        this.updateMousePosition(event.clientX, event.clientY);
        this.dragStartPosition = { x: event.clientX, y: event.clientY };
        // Only handle the click if we clicked on the dice
        const didClickDice = this.checkDiceClick(event);
        if (!didClickDice) {
            // If not clicking on dice, don't prevent the event
            // Let it pass through to Obsidian
            return;
        }
    }
    onTouchStart(event) {
        if (event.touches.length === 1) {
            this.updateMousePosition(event.touches[0].clientX, event.touches[0].clientY);
            this.dragStartPosition = { x: event.touches[0].clientX, y: event.touches[0].clientY };
            // Create a mock mouse event for dice checking
            const mockEvent = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                clientX: event.touches[0].clientX,
                clientY: event.touches[0].clientY
            });
            const diceClicked = this.checkDiceClick(mockEvent);
            if (!diceClicked) {
                // Allow touch to pass through if not touching dice
                return;
            }
            else {
                event.preventDefault();
            }
        }
    }
    onMouseMove(event) {
        this.updateMousePosition(event.clientX, event.clientY);
        // Check for hover to show visual feedback only (multi-dice system)
        if (!this.isRolling && !this.isDragging && this.diceArray.length > 0) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.diceArray, true);
            this.isHoveringDice = intersects.length > 0;
            // Update cursor for visual feedback
            const canvas = this.renderer.domElement;
            if (this.isHoveringDice && !this.forceClickthroughMode) {
                canvas.style.cursor = 'grab';
            }
            else {
                canvas.style.cursor = 'default';
            }
        }
        if (this.isDragging) {
            // Calculate mouse velocity for momentum
            const currentTime = Date.now();
            const deltaTime = currentTime - this.lastMousePosition.time;
            if (deltaTime > 0) {
                this.mouseVelocity.x = (event.clientX - this.lastMousePosition.x) / deltaTime;
                this.mouseVelocity.y = (event.clientY - this.lastMousePosition.y) / deltaTime;
            }
            this.lastMousePosition = { x: event.clientX, y: event.clientY, time: currentTime };
            this.updateDicePosition();
            this.renderer.domElement.style.cursor = 'grabbing';
        }
    }
    onMouseEnter(event) {
        this.updateMousePosition(event.clientX, event.clientY);
        if (!this.isRolling && !this.isDragging && this.diceArray.length > 0) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.diceArray, true);
            this.isHoveringDice = intersects.length > 0;
        }
    }
    onMouseLeave(event) {
        if (!this.isDragging) {
            this.isHoveringDice = false;
            this.renderer.domElement.style.cursor = 'default';
        }
    }
    onTouchMove(event) {
        if (this.isDragging && event.touches.length === 1) {
            // Calculate touch velocity for momentum
            const currentTime = Date.now();
            const deltaTime = currentTime - this.lastMousePosition.time;
            if (deltaTime > 0) {
                this.mouseVelocity.x = (event.touches[0].clientX - this.lastMousePosition.x) / deltaTime;
                this.mouseVelocity.y = (event.touches[0].clientY - this.lastMousePosition.y) / deltaTime;
            }
            this.lastMousePosition = { x: event.touches[0].clientX, y: event.touches[0].clientY, time: currentTime };
            this.updateMousePosition(event.touches[0].clientX, event.touches[0].clientY);
            this.updateDicePosition();
            event.preventDefault();
        }
    }
    onMouseUp(event) {
        if (this.isDragging) {
            this.throwDice(event.clientX, event.clientY);
        }
    }
    onTouchEnd(event) {
        if (this.isDragging) {
            const touch = event.changedTouches[0];
            this.throwDice(touch.clientX, touch.clientY);
        }
    }
    checkDiceClick(event) {
        this.raycaster.setFromCamera(this.mouse, this.camera);
        // Check for intersections with all dice
        const intersects = this.raycaster.intersectObjects(this.diceArray, true);
        if (intersects.length > 0) {
            // Find which dice was clicked
            const clickedObject = intersects[0].object;
            let clickedDiceIndex = -1;
            for (let i = 0; i < this.diceArray.length; i++) {
                if (this.diceArray[i] === clickedObject) {
                    clickedDiceIndex = i;
                    break;
                }
            }
            if (clickedDiceIndex === -1)
                return false;
            // Only prevent event propagation when actually clicking on dice
            event.stopPropagation();
            event.preventDefault();
            // Handle different interaction modes
            if (event.ctrlKey && event.altKey) {
                // Ctrl+Alt+Click: Delete dice
                this.deleteDiceAtIndex(clickedDiceIndex);
                return true;
            }
            else if (event.ctrlKey) {
                // Ctrl+Click: Select/drag all dice
                this.startDragAllDice();
                return true;
            }
            else {
                // Regular click: Select/drag individual dice
                this.startDragSingleDice(clickedDiceIndex);
                return true;
            }
        }
        return false; // Indicate that no dice was clicked
    }
    deleteDiceAtIndex(index) {
        if (index < 0 || index >= this.diceArray.length)
            return;
        const diceType = this.diceTypeArray[index];
        // Remove from scene and physics
        this.scene.remove(this.diceArray[index]);
        this.world.removeBody(this.diceBodyArray[index]);
        // Dispose geometry and material
        this.diceArray[index].geometry.dispose();
        if (this.diceArray[index].material && !Array.isArray(this.diceArray[index].material)) {
            this.diceArray[index].material.dispose();
        }
        // Remove from arrays
        this.diceArray.splice(index, 1);
        this.diceBodyArray.splice(index, 1);
        this.diceTypeArray.splice(index, 1);
        // Update dice count in settings
        this.settings.diceCounts[diceType]--;
        console.log(`Deleted ${diceType} dice. Remaining: ${this.diceArray.length}`);
    }
    startDragSingleDice(index) {
        this.isDragging = true;
        this.draggedDiceIndex = index;
        this.renderer.domElement.style.cursor = 'grabbing';
        // Clear highlight and reset state if this dice was caught
        const state = this.diceStates[index];
        if (state && state.isCaught) {
            console.log(`🔄 Clearing highlight from caught dice ${index} - manual throw`);
            this.highlightCaughtDice(index, false);
            state.isCaught = false;
            state.isComplete = false;
            state.result = null;
            state.stableTime = 0;
            state.isRolling = true;
            state.lastMotion = Date.now();
        }
        // Initialize velocity tracking
        this.lastMousePosition = { x: this.dragStartPosition.x, y: this.dragStartPosition.y, time: Date.now() };
        this.mouseVelocity = { x: 0, y: 0 };
        // Stop any current rolling
        if (this.rollTimeout) {
            clearTimeout(this.rollTimeout);
            this.rollTimeout = null;
        }
        this.isRolling = false;
        // Reset the dragged dice position for dragging
        const body = this.diceBodyArray[index];
        body.position.set(0, 2, 0);
        body.velocity.set(0, 0, 0);
        body.angularVelocity.set(0, 0, 0);
    }
    startDragAllDice() {
        this.isDragging = true;
        this.draggedDiceIndex = -1; // -1 indicates all dice
        this.renderer.domElement.style.cursor = 'grabbing';
        // Initialize velocity tracking
        this.lastMousePosition = { x: this.dragStartPosition.x, y: this.dragStartPosition.y, time: Date.now() };
        this.mouseVelocity = { x: 0, y: 0 };
        // Stop any current rolling
        if (this.rollTimeout) {
            clearTimeout(this.rollTimeout);
            this.rollTimeout = null;
        }
        this.isRolling = false;
        // Reset all dice positions for dragging
        for (let i = 0; i < this.diceBodyArray.length; i++) {
            const body = this.diceBodyArray[i];
            const spread = Math.sqrt(this.diceArray.length) * 1.5;
            const angle = (i / this.diceArray.length) * Math.PI * 2;
            // Clear highlight and reset state if this dice was caught
            const state = this.diceStates[i];
            if (state && state.isCaught) {
                console.log(`🔄 Clearing highlight from caught dice ${i} - drag all`);
                this.highlightCaughtDice(i, false);
                state.isCaught = false;
                state.isComplete = false;
                state.result = null;
                state.stableTime = 0;
                state.isRolling = true;
                state.lastMotion = Date.now();
            }
            body.position.set(Math.cos(angle) * spread, 2, Math.sin(angle) * spread);
            body.velocity.set(0, 0, 0);
            body.angularVelocity.set(0, 0, 0);
        }
    }
    updateDicePosition() {
        if (!this.isDragging)
            return;
        // For orthographic camera, convert mouse coordinates directly to world coordinates
        const frustumHeight = this.camera.top - this.camera.bottom;
        const frustumWidth = this.camera.right - this.camera.left;
        // Convert normalized mouse coordinates to world coordinates
        const worldX = (this.mouse.x * frustumWidth) / 2;
        const worldZ = -(this.mouse.y * frustumHeight) / 2; // Negative because Y is flipped
        // Set position at dice tray level (Y = 2)
        const worldPosition = new THREE.Vector3(worldX, 2, worldZ);
        // Constrain to tray bounds
        worldPosition.x = Math.max(-9, Math.min(9, worldPosition.x));
        worldPosition.z = Math.max(-6, Math.min(6, worldPosition.z));
        if (this.draggedDiceIndex === -1) {
            // Drag all dice - maintain relative positions
            for (let i = 0; i < this.diceBodyArray.length; i++) {
                const body = this.diceBodyArray[i];
                const mesh = this.diceArray[i];
                body.position.copy(worldPosition);
                // Add slight spread to prevent overlapping
                const spread = Math.sqrt(this.diceArray.length) * 0.8;
                const angle = (i / this.diceArray.length) * Math.PI * 2;
                body.position.x += Math.cos(angle) * spread;
                body.position.z += Math.sin(angle) * spread;
                // Add rolling animation while dragging
                mesh.rotation.x += 0.05;
                mesh.rotation.y += 0.05;
                mesh.rotation.z += 0.025;
            }
        }
        else if (this.draggedDiceIndex >= 0 && this.draggedDiceIndex < this.diceBodyArray.length) {
            // Drag single dice
            const body = this.diceBodyArray[this.draggedDiceIndex];
            const mesh = this.diceArray[this.draggedDiceIndex];
            body.position.copy(worldPosition);
            // Add rolling animation while dragging
            mesh.rotation.x += 0.1;
            mesh.rotation.y += 0.1;
            mesh.rotation.z += 0.05;
        }
    }
    throwDice(endX, endY) {
        this.isDragging = false;
        this.renderer.domElement.style.cursor = 'default';
        this.isRolling = true;
        // Track which dice we're rolling (single or all)
        const rollingSingleDice = this.draggedDiceIndex >= 0;
        // Use mouse velocity for realistic momentum-based throwing
        const velocityMultiplier = 50;
        const baseThrowForce = new CANNON.Vec3(this.mouseVelocity.x * velocityMultiplier, -Math.max(Math.abs(this.mouseVelocity.x + this.mouseVelocity.y) * velocityMultiplier * 0.5, 3), this.mouseVelocity.y * velocityMultiplier);
        // Cap maximum force to prevent dice from flying too far
        const maxForce = 25;
        const forceLength = baseThrowForce.length();
        if (forceLength > maxForce) {
            baseThrowForce.scale(maxForce / forceLength, baseThrowForce);
        }
        // Apply throwing force to the appropriate dice
        if (this.draggedDiceIndex === -1) {
            // Throw all dice
            for (let i = 0; i < this.diceBodyArray.length; i++) {
                const body = this.diceBodyArray[i];
                // Add some randomness for each dice
                const throwForce = baseThrowForce.clone();
                throwForce.x += (Math.random() - 0.5) * 5;
                throwForce.z += (Math.random() - 0.5) * 5;
                body.velocity.copy(throwForce);
                // Apply spin based on velocity direction and magnitude
                const spinIntensity = Math.min(Math.sqrt(this.mouseVelocity.x * this.mouseVelocity.x + this.mouseVelocity.y * this.mouseVelocity.y) * 100, 25);
                body.angularVelocity.set((Math.random() - 0.5) * spinIntensity + this.mouseVelocity.y * 10, (Math.random() - 0.5) * spinIntensity, (Math.random() - 0.5) * spinIntensity + this.mouseVelocity.x * 10);
            }
        }
        else if (this.draggedDiceIndex >= 0 && this.draggedDiceIndex < this.diceBodyArray.length) {
            // Throw single dice
            const body = this.diceBodyArray[this.draggedDiceIndex];
            body.velocity.copy(baseThrowForce);
            // Apply spin based on velocity direction and magnitude
            const spinIntensity = Math.min(Math.sqrt(this.mouseVelocity.x * this.mouseVelocity.x + this.mouseVelocity.y * this.mouseVelocity.y) * 100, 25);
            body.angularVelocity.set((Math.random() - 0.5) * spinIntensity + this.mouseVelocity.y * 10, (Math.random() - 0.5) * spinIntensity, (Math.random() - 0.5) * spinIntensity + this.mouseVelocity.x * 10);
        }
        // Store which dice was rolled before resetting
        const rolledDiceIndex = this.draggedDiceIndex;
        // Reset dragged dice index
        this.draggedDiceIndex = -1;
        // Start checking for settling based on what was rolled
        if (rollingSingleDice) {
            // Check if this is part of an active group roll (monitoring is still running)
            if (this.currentMonitor !== null && this.diceStates.length > 0 && rolledDiceIndex < this.diceStates.length) {
                // This is a reroll of a caught dice from a group roll - just reset its state
                const state = this.diceStates[rolledDiceIndex];
                state.isRolling = true;
                state.isCaught = false;
                state.isComplete = false;
                state.result = null;
                state.stableTime = 0;
                state.lastMotion = Date.now();
                console.log(`🔄 Rerolling dice ${rolledDiceIndex} as part of active group roll - state reset`);
                // Don't call checkSingleDiceSettling - let the group monitor handle it
            }
            else {
                // True single dice roll - check only that dice
                this.checkSingleDiceSettling(rolledDiceIndex);
            }
        }
        else {
            // Multiple dice - use enhanced monitoring with catching detection
            this.initializeDiceStates();
            // Note: Forces already applied above, just start monitoring
            this.startIndividualDiceMonitoring((result) => {
                // On completion, trigger callback
                if (this.onRollComplete) {
                    this.onRollComplete(result);
                }
                this.isRolling = false;
            }, (error) => {
                console.error('Throw monitoring error:', error);
                this.isRolling = false;
            });
        }
        // Set timeout for force stop
        const baseTimeout = 6000;
        const extendedTimeout = baseTimeout + (this.settings.motionThreshold * 1000);
        console.log(`🕐 Throw timeout set to ${extendedTimeout}ms`);
        this.rollTimeout = setTimeout(() => {
            if (rollingSingleDice) {
                this.completeSingleDiceRoll(rolledDiceIndex);
            }
            else {
                this.forceStopMultiRoll();
            }
        }, extendedTimeout);
    }
    forceStop() {
        if (this.rollTimeout) {
            clearTimeout(this.rollTimeout);
            this.rollTimeout = null;
        }
        console.log('Force stopping dice roll');
        this.isRolling = false;
        const canvas = this.renderer.domElement;
        canvas.style.cursor = 'default';
        this.diceBody.velocity.set(0, 0, 0);
        this.diceBody.angularVelocity.set(0, 0, 0);
        this.calculateResult();
    }
    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        // Step physics simulation with fixed timestep for consistency
        this.world.step(1 / 60);
        // Debug: Check physics values occasionally
        if (this.isRolling && Math.random() < 0.01) { // 1% chance
            if (this.diceBodyArray.length > 0) {
                const body = this.diceBodyArray[0];
                console.log(`🎯 Physics debug: vel=${body.velocity.length().toFixed(3)}, angVel=${body.angularVelocity.length().toFixed(3)}, damping: linear=${body.linearDamping}, angular=${body.angularDamping}, worldBodies: ${this.world.bodies.length}, time: ${this.world.time.toFixed(2)}`);
            }
        }
        // Update all dice visual positions from physics bodies (unless showing result animation)
        if (!this.showingResult) {
            for (let i = 0; i < this.diceArray.length; i++) {
                const dice = this.diceArray[i];
                const body = this.diceBodyArray[i];
                if (dice && body) {
                    dice.position.copy(body.position);
                    dice.quaternion.copy(body.quaternion);
                }
            }
        }
        // Note: Hover circle functionality disabled for multi-dice system
        // Note: Rolling detection simplified for multi-dice system
        // Individual dice rolling logic will be implemented in future phases
        this.renderer.render(this.scene, this.camera);
    }
    calculateResult() {
        const result = this.getTopFaceNumber();
        console.log(`Natural dice result: ${result}`);
        // Snap behavior removed - UV mapping handles proper face display
        if (this.onRollComplete) {
            this.onRollComplete(result);
        }
        if (this.rollResolve) {
            this.rollResolve(result);
            this.rollResolve = null;
        }
    }
    calculateRotationForTopFace(targetFaceNumber) {
        // Use the accurate Euler rotations captured for each face
        const faceRotations = {
            1: new THREE.Euler(-1.7, -0.9, -2.5),
            2: new THREE.Euler(-0.0, -0.5, 2.0),
            3: new THREE.Euler(0.00, -0.28, -1.94),
            4: new THREE.Euler(-0.5, -2.8, 0.6),
            5: new THREE.Euler(-0.89, -0.73, 0.10),
            6: new THREE.Euler(1.24, 0.17, -2.02),
            7: new THREE.Euler(-1.2, 0.1, -1.5),
            8: new THREE.Euler(-0.7, 2.2, -2.5),
            9: new THREE.Euler(2.47, -0.39, 2.06),
            10: new THREE.Euler(-2.8, 0.1, 0.1),
            11: new THREE.Euler(0.39, -0.33, 0.13),
            12: new THREE.Euler(-0.95, 0.78, 3.14),
            13: new THREE.Euler(-2.6, -0.0, -3.1),
            14: new THREE.Euler(1.51, 0.36, 0.18),
            15: new THREE.Euler(-1.2, -0.0, 1.6),
            16: new THREE.Euler(0.98, 0.82, 3.11),
            17: new THREE.Euler(-2.45, -0.45, 1.13),
            18: new THREE.Euler(-0.0, 0.6, 1.2),
            19: new THREE.Euler(-0.0, -0.5, -1.2),
            20: new THREE.Euler(-2.4, 2.7, -1.2)
        };
        const targetRotation = faceRotations[targetFaceNumber];
        if (targetRotation) {
            console.log(`Using calibrated rotation for face ${targetFaceNumber}:`, targetRotation);
            return targetRotation;
        }
        else {
            console.warn(`No calibrated rotation found for face ${targetFaceNumber}, using default`);
            return new THREE.Euler(0, 0, 0);
        }
    }
    debugPhysics() {
        console.log('❌ Legacy debugPhysics() disabled for multi-dice system');
        return;
        console.group('🎲 DICE PHYSICS DEBUG');
        // Current detected face
        const detectedFace = this.getTopFaceNumber();
        console.log(`🎯 Detected Face: ${detectedFace}`);
        // Physics body properties
        console.group('⚙️ Physics Body');
        console.log(`Position: (${this.diceBody.position.x.toFixed(3)}, ${this.diceBody.position.y.toFixed(3)}, ${this.diceBody.position.z.toFixed(3)})`);
        console.log(`Velocity: (${this.diceBody.velocity.x.toFixed(3)}, ${this.diceBody.velocity.y.toFixed(3)}, ${this.diceBody.velocity.z.toFixed(3)})`);
        console.log(`Linear Speed: ${this.diceBody.velocity.length().toFixed(3)} m/s`);
        console.log(`Angular Velocity: (${this.diceBody.angularVelocity.x.toFixed(3)}, ${this.diceBody.angularVelocity.y.toFixed(3)}, ${this.diceBody.angularVelocity.z.toFixed(3)})`);
        console.log(`Angular Speed: ${this.diceBody.angularVelocity.length().toFixed(3)} rad/s`);
        console.log(`Mass: ${this.diceBody.mass} kg`);
        console.log(`Type: ${this.diceBody.type === CANNON.Body.DYNAMIC ? 'DYNAMIC' : this.diceBody.type === CANNON.Body.STATIC ? 'STATIC' : 'KINEMATIC'}`);
        console.groupEnd();
        // Visual mesh properties
        console.group('👁️ Visual Mesh');
        console.log(`Rotation (Euler): (${this.dice.rotation.x.toFixed(3)}, ${this.dice.rotation.y.toFixed(3)}, ${this.dice.rotation.z.toFixed(3)})`);
        console.log(`Position: (${this.dice.position.x.toFixed(3)}, ${this.dice.position.y.toFixed(3)}, ${this.dice.position.z.toFixed(3)})`);
        console.log(`Scale: (${this.dice.scale.x.toFixed(3)}, ${this.dice.scale.y.toFixed(3)}, ${this.dice.scale.z.toFixed(3)})`);
        console.groupEnd();
        // Physics quaternion vs Euler comparison
        console.group('🔄 Rotation Analysis');
        const physicsQuat = this.diceBody.quaternion;
        const visualEuler = this.dice.rotation;
        const physicsEuler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(physicsQuat.x, physicsQuat.y, physicsQuat.z, physicsQuat.w));
        console.log(`Physics Quaternion: (${physicsQuat.x.toFixed(3)}, ${physicsQuat.y.toFixed(3)}, ${physicsQuat.z.toFixed(3)}, ${physicsQuat.w.toFixed(3)})`);
        console.log(`Physics as Euler: (${physicsEuler.x.toFixed(3)}, ${physicsEuler.y.toFixed(3)}, ${physicsEuler.z.toFixed(3)})`);
        console.log(`Visual Euler: (${visualEuler.x.toFixed(3)}, ${visualEuler.y.toFixed(3)}, ${visualEuler.z.toFixed(3)})`);
        console.groupEnd();
        // Material properties
        console.group('🧪 Material Properties');
        const material = this.diceBody.material;
        if (material) {
            console.log(`Friction: ${material.friction}`);
            console.log(`Restitution: ${material.restitution}`);
        }
        console.log(`Linear Damping: ${this.diceBody.linearDamping}`);
        console.log(`Angular Damping: ${this.diceBody.angularDamping}`);
        console.groupEnd();
        // State flags
        console.group('🏃 State Flags');
        console.log(`Is Rolling: ${this.isRolling}`);
        console.log(`Is Dragging: ${this.isDragging}`);
        console.log(`Showing Result: ${this.showingResult}`);
        console.groupEnd();
        // Face detection distances (for debugging face detection accuracy)
        console.group('📊 Face Detection Analysis');
        this.debugFaceDetectionDistances();
        console.groupEnd();
        console.groupEnd();
    }
    debugFaceDetectionDistances() {
        const currentRotation = this.dice.rotation;
        const faceRotations = {
            1: new THREE.Euler(-1.7, -0.9, -2.5),
            2: new THREE.Euler(-0.0, -0.5, 2.0),
            3: new THREE.Euler(0.00, -0.28, -1.94),
            4: new THREE.Euler(-0.5, -2.8, 0.6),
            5: new THREE.Euler(-0.89, -0.73, 0.10),
            6: new THREE.Euler(1.24, 0.17, -2.02),
            7: new THREE.Euler(-1.2, 0.1, -1.5),
            8: new THREE.Euler(-0.7, 2.2, -2.5),
            9: new THREE.Euler(2.47, -0.39, 2.06),
            10: new THREE.Euler(-2.8, 0.1, 0.1),
            11: new THREE.Euler(0.39, -0.33, 0.13),
            12: new THREE.Euler(-0.95, 0.78, 3.14),
            13: new THREE.Euler(-2.6, -0.0, -3.1),
            14: new THREE.Euler(1.51, 0.36, 0.18),
            15: new THREE.Euler(-1.2, -0.0, 1.6),
            16: new THREE.Euler(0.98, 0.82, 3.11),
            17: new THREE.Euler(-2.45, -0.45, 1.13),
            18: new THREE.Euler(-0.0, 0.6, 1.2),
            19: new THREE.Euler(-0.0, -0.5, -1.2),
            20: new THREE.Euler(-2.4, 2.7, -1.2)
        };
        const distances = [];
        for (const [faceNum, targetRotation] of Object.entries(faceRotations)) {
            const face = parseInt(faceNum);
            const dx = this.normalizeAngle(currentRotation.x - targetRotation.x);
            const dy = this.normalizeAngle(currentRotation.y - targetRotation.y);
            const dz = this.normalizeAngle(currentRotation.z - targetRotation.z);
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            distances.push({ face, distance });
        }
        // Sort by distance (closest first)
        distances.sort((a, b) => a.distance - b.distance);
        console.log('Current rotation vs all calibrated face rotations:');
        console.table(distances.map(d => ({
            Face: d.face,
            Distance: parseFloat(d.distance.toFixed(3)),
            'Target Euler X': faceRotations[d.face].x.toFixed(2),
            'Target Euler Y': faceRotations[d.face].y.toFixed(2),
            'Target Euler Z': faceRotations[d.face].z.toFixed(2)
        })));
        console.log('🏆 TOP 5 CLOSEST MATCHES:');
        for (let i = 0; i < Math.min(5, distances.length); i++) {
            const { face, distance } = distances[i];
            const targetEuler = faceRotations[face];
            console.log(`${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i === 3 ? '4️⃣' : '5️⃣'} Face ${face}: distance ${distance.toFixed(3)}`);
            console.log(`   Target: (${targetEuler.x.toFixed(2)}, ${targetEuler.y.toFixed(2)}, ${targetEuler.z.toFixed(2)})`);
            console.log(`   Current: (${currentRotation.x.toFixed(2)}, ${currentRotation.y.toFixed(2)}, ${currentRotation.z.toFixed(2)})`);
            const dx = this.normalizeAngle(currentRotation.x - targetEuler.x);
            const dy = this.normalizeAngle(currentRotation.y - targetEuler.y);
            const dz = this.normalizeAngle(currentRotation.z - targetEuler.z);
            console.log(`   Diff: (${dx.toFixed(2)}, ${dy.toFixed(2)}, ${dz.toFixed(2)})`);
            console.log('');
        }
    }
    calculateRotationToShowFace(faceNormal) {
        // We want this face normal to point upward (positive Y direction)
        const upVector = new THREE.Vector3(0, 1, 0);
        // Create a rotation that aligns the face normal with up vector
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(faceNormal, upVector);
        // Convert to Euler angles
        const euler = new THREE.Euler();
        euler.setFromQuaternion(quaternion);
        return euler;
    }
    getTopFaceNumber() {
        try {
            if (this.faceNormals.length === 0) {
                console.warn('Face normals not calculated, falling back to random');
                const faceCount = this.getFaceCount();
                return Math.floor(Math.random() * faceCount) + 1;
            }
            // Define the detection vector based on dice type
            // D4 uses down vector since faces point downward when resting
            // All other dice use up vector since faces point upward when resting
            const detectionVector = this.settings.diceType === 'd4'
                ? new THREE.Vector3(0, -1, 0) // Down vector for D4
                : new THREE.Vector3(0, 1, 0); // Up vector for other dice
            // Detection tolerance - dot product must be within this range of 1.0 for "up"
            const tolerance = this.settings.faceDetectionTolerance;
            const minDotProduct = 1.0 - tolerance;
            let bestFace = 1;
            let bestDotProduct = -1;
            const detectionResults = [];
            // Check each face normal against the up vector
            for (let i = 0; i < this.faceNormals.length; i++) {
                // Transform face normal to world space using dice rotation
                const worldNormal = this.faceNormals[i].clone();
                worldNormal.applyQuaternion(this.dice.quaternion);
                // Calculate dot product with detection vector
                const dotProduct = worldNormal.dot(detectionVector);
                // Get face number based on dice type
                const faceCount = this.getFaceCount();
                let faceNumber = Math.min(faceCount, (i % faceCount) + 1);
                // D10 specific face mapping correction
                if (this.settings.diceType === 'd10') {
                    const d10Mapping = {
                        1: 5, 2: 4, 3: 3, 4: 2, 5: 1,
                        6: 10, 7: 9, 8: 8, 9: 7, 10: 6
                    };
                    faceNumber = d10Mapping[faceNumber] || faceNumber;
                }
                detectionResults.push({ face: faceNumber, dotProduct, worldNormal });
                // Check if this face is pointing "up" (within tolerance)
                if (dotProduct > bestDotProduct) {
                    bestDotProduct = dotProduct;
                    bestFace = faceNumber;
                }
            }
            // Sort by dot product (best match first)
            detectionResults.sort((a, b) => b.dotProduct - a.dotProduct);
            // Debug logging
            const directionName = this.settings.diceType === 'd4' ? 'DOWN' : 'UP';
            console.log('🎯 Face Normal Detection Results:');
            console.log(`Detection vector (${directionName}): (${detectionVector.x}, ${detectionVector.y}, ${detectionVector.z})`);
            console.log(`Tolerance: ${tolerance} (min dot product: ${minDotProduct.toFixed(3)})`);
            console.log(`Best face: ${bestFace} (dot product: ${bestDotProduct.toFixed(3)})`);
            // Log top 5 candidates
            console.log('🏆 TOP 5 FACE CANDIDATES:');
            for (let i = 0; i < Math.min(5, detectionResults.length); i++) {
                const result = detectionResults[i];
                const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i === 3 ? '4️⃣' : '5️⃣';
                const isDetected = result.dotProduct >= minDotProduct ? `✅ ${directionName}` : '❌';
                console.log(`${emoji} Face ${result.face}: dot=${result.dotProduct.toFixed(3)} ${isDetected}`);
                console.log(`   World normal: (${result.worldNormal.x.toFixed(3)}, ${result.worldNormal.y.toFixed(3)}, ${result.worldNormal.z.toFixed(3)})`);
            }
            // Warn if no face is clearly detected
            const detectionType = this.settings.diceType === 'd4' ? 'down' : 'up';
            if (bestDotProduct < minDotProduct) {
                console.warn(`⚠️ No face is clearly pointing ${detectionType}! Best dot product: ${bestDotProduct.toFixed(3)} (threshold: ${minDotProduct.toFixed(3)})`);
                console.warn('Dice may still be moving or in an edge case orientation');
            }
            return bestFace;
        }
        catch (error) {
            console.error('Error in face normal detection:', error);
            const faceCount = this.getFaceCount();
            return Math.floor(Math.random() * faceCount) + 1;
        }
    }
    snapDiceToFace(faceNumber, targetPosition) {
        if (!this.diceGeometry || this.faceNormals.length === 0) {
            return;
        }
        const faceIndex = Math.max(0, Math.min(faceNumber - 1, this.faceNormals.length - 1));
        const faceNormal = this.faceNormals[faceIndex];
        if (!faceNormal) {
            return;
        }
        const targetRotation = this.calculateRotationToShowFace(faceNormal.clone());
        const targetQuaternion = new THREE.Quaternion().setFromEuler(targetRotation);
        const lowestVertexY = this.getLowestVertexYForQuaternion(targetQuaternion);
        const desiredY = this.floorHeight - lowestVertexY + 0.002;
        const nextPosition = targetPosition ? targetPosition.clone() : this.dice.position.clone();
        nextPosition.y = desiredY;
        this.dice.quaternion.copy(targetQuaternion);
        this.dice.position.copy(nextPosition);
        this.diceBody.quaternion.set(targetQuaternion.x, targetQuaternion.y, targetQuaternion.z, targetQuaternion.w);
        this.diceBody.position.set(nextPosition.x, nextPosition.y, nextPosition.z);
        this.diceBody.velocity.set(0, 0, 0);
        this.diceBody.angularVelocity.set(0, 0, 0);
        this.diceBody.force.set(0, 0, 0);
        this.diceBody.torque.set(0, 0, 0);
        this.diceBody.allowSleep = true;
        this.diceBody.sleepSpeedLimit = 0.02;
        this.diceBody.sleepTimeLimit = 0.2;
        this.diceBody.sleep();
    }
    getLowestVertexYForQuaternion(quaternion) {
        if (!this.diceGeometry) {
            return 0;
        }
        const positionAttribute = this.diceGeometry.attributes.position;
        if (!positionAttribute) {
            return 0;
        }
        const vertex = new THREE.Vector3();
        let minY = Infinity;
        for (let i = 0; i < positionAttribute.count; i++) {
            vertex.fromBufferAttribute(positionAttribute, i);
            vertex.applyQuaternion(quaternion);
            if (vertex.y < minY) {
                minY = vertex.y;
            }
        }
        return minY === Infinity ? 0 : minY;
    }
    snapToNearestFace() {
        const nearestFace = this.getTopFaceNumber();
        // All snap behavior removed - dice settle naturally
        const faceRotations = {
            1: new THREE.Euler(-1.7, -0.9, -2.5),
            2: new THREE.Euler(-0.0, -0.5, 2.0),
            3: new THREE.Euler(-0.0, 0.6, -1.9),
            4: new THREE.Euler(-0.5, -2.8, 0.6),
            5: new THREE.Euler(-2.4, -0.4, -1.9),
            6: new THREE.Euler(-1.7, 2.9, 0.6),
            7: new THREE.Euler(-1.2, 0.1, -1.5),
            8: new THREE.Euler(-0.7, 2.2, -2.5),
            9: new THREE.Euler(0.7, 0.6, -1.2),
            10: new THREE.Euler(-2.8, 0.1, 0.1),
            11: new THREE.Euler(2.5, 1.0, -2.5),
            12: new THREE.Euler(-1.7, -0.9, 0.6),
            13: new THREE.Euler(-2.6, -0.0, -3.1),
            14: new THREE.Euler(-2.8, -2.7, 0.0),
            15: new THREE.Euler(-1.2, -0.0, 1.6),
            16: new THREE.Euler(-0.6, -2.8, -2.5),
            17: new THREE.Euler(-2.3, -0.5, 1.3),
            18: new THREE.Euler(-0.0, 0.6, 1.2),
            19: new THREE.Euler(-0.0, -0.5, -1.2),
            20: new THREE.Euler(-2.4, 2.7, -1.2)
        };
        const targetRotation = faceRotations[nearestFace];
        if (targetRotation) {
            const currentRotation = this.dice.rotation;
            const snapStrength = 0.5;
            this.dice.rotation.x = currentRotation.x + (targetRotation.x - currentRotation.x) * snapStrength;
            this.dice.rotation.y = currentRotation.y + (targetRotation.y - currentRotation.y) * snapStrength;
            this.dice.rotation.z = currentRotation.z + (targetRotation.z - currentRotation.z) * snapStrength;
            const quaternion = new THREE.Quaternion();
            quaternion.setFromEuler(this.dice.rotation);
            this.diceBody.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        }
    }
    normalizeAngle(angle) {
        // Normalize angle to [-π, π]
        while (angle > Math.PI)
            angle -= 2 * Math.PI;
        while (angle < -Math.PI)
            angle += 2 * Math.PI;
        return angle;
    }
    setInitialSize() {
        // Get the full window size minus ribbon
        const containerWidth = window.innerWidth;
        const containerHeight = window.innerHeight - 44; // 44px for ribbon
        this.updateSize(containerWidth, containerHeight);
    }
    updateSize(width, height) {
        // Force renderer to exactly match the provided dimensions
        this.renderer.setSize(width, height, true);
        // Update pixel ratio for crisp rendering
        this.renderer.setPixelRatio(window.devicePixelRatio);
        // Set canvas to fill container completely without any constraints
        const canvas = this.renderer.domElement;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas.style.display = 'block';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        // Update orthographic camera frustum to match the exact window dimensions
        const aspect = width / height;
        const frustumSize = 20;
        this.camera.left = -frustumSize * aspect / 2;
        this.camera.right = frustumSize * aspect / 2;
        this.camera.top = frustumSize / 2;
        this.camera.bottom = -frustumSize / 2;
        // Update the camera projection matrix for orthographic camera
        this.camera.updateProjectionMatrix();
    }
    reinitializeAfterContextLoss() {
        try {
            // Recreate the scene elements
            this.createDiceTray();
            this.setupLighting();
            console.log('Scene reinitialized after WebGL context restore');
        }
        catch (error) {
            console.error('Failed to reinitialize scene after context loss:', error);
        }
    }
    createWindowBorder() {
        if (this.settings.showWindowBorder) {
            this.windowBorder = document.createElement('div');
            this.windowBorder.style.position = 'absolute';
            this.windowBorder.style.top = '0';
            this.windowBorder.style.left = '0';
            this.windowBorder.style.width = '100%';
            this.windowBorder.style.height = '100%';
            this.windowBorder.style.border = `${this.settings.windowBorderWidth}px solid ${this.settings.windowBorderColor}`;
            this.windowBorder.style.opacity = this.settings.windowBorderOpacity.toString();
            this.windowBorder.style.pointerEvents = 'none';
            this.windowBorder.style.boxSizing = 'border-box';
            this.container.appendChild(this.windowBorder);
        }
    }
    removeWindowBorder() {
        if (this.windowBorder) {
            this.container.removeChild(this.windowBorder);
            this.windowBorder = null;
        }
    }
    updateSettings(newSettings) {
        console.log('🔧 D20Dice settings updated:', {
            oldMotionThreshold: this.settings.motionThreshold,
            newMotionThreshold: newSettings.motionThreshold,
            oldResultAnimation: this.settings.enableResultAnimation,
            newResultAnimation: newSettings.enableResultAnimation
        });
        this.settings = newSettings;
        // Update window border
        this.removeWindowBorder();
        this.createWindowBorder();
        // Update dice material properties
        if (this.dice && this.dice.material) {
            const material = this.dice.material;
            material.color.setStyle(this.settings.diceColor);
            material.shininess = this.settings.diceShininess;
            material.specular = new THREE.Color(this.settings.diceSpecular);
            material.transparent = this.settings.diceTransparent;
            material.opacity = this.settings.diceOpacity;
            material.needsUpdate = true;
        }
        // Note: In multi-dice system, individual dice settings are handled when created
        // No need to recreate all dice on settings change
        // Update tray
        if (this.trayMesh) {
            this.scene.remove(this.trayMesh);
            this.trayMesh = null;
        }
        this.createDiceTray();
        // Update renderer shadow settings
        this.renderer.shadowMap.enabled = this.settings.enableShadows;
        // Update lighting
        this.setupLighting();
    }
    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.rollTimeout) {
            clearTimeout(this.rollTimeout);
        }
        // Clean up hover circle
        if (this.hoverCircle) {
            this.scene.remove(this.hoverCircle);
            this.hoverCircle = null;
            this.hoverCircleMaterial = null;
        }
        // Clean up window border
        this.removeWindowBorder();
        // Remove event listeners
        if (this.renderer) {
            const canvas = this.renderer.domElement;
            this.container.removeChild(this.renderer.domElement);
            this.renderer.dispose();
            const gl = this.renderer.getContext();
            if (gl && gl.getExtension('WEBGL_lose_context')) {
                gl.getExtension('WEBGL_lose_context').loseContext();
            }
        }
        if (this.scene) {
            this.scene.clear();
        }
        if (this.world) {
            this.world.bodies.forEach(body => {
                this.world.removeBody(body);
            });
        }
    }
    autoCalibrateFace(faceNumber) {
        if (!this.dice || !this.diceBody) {
            console.error('Cannot calibrate: dice not initialized');
            return false;
        }
        const faceCount = this.getFaceCount();
        if (faceNumber < 1 || faceNumber > faceCount) {
            console.error(`Face number must be between 1 and ${faceCount} for ${this.settings.diceType}`);
            return false;
        }
        console.log(`🎯 AUTO-CALIBRATING Face ${faceNumber}`);
        // Find which face is currently pointing most upward
        const upVector = new THREE.Vector3(0, 1, 0);
        let bestFaceIndex = 0;
        let bestDotProduct = -1;
        for (let i = 0; i < this.faceNormals.length; i++) {
            // Transform face normal to world space
            const worldNormal = this.faceNormals[i].clone();
            worldNormal.applyQuaternion(this.dice.quaternion);
            // Calculate dot product with up vector
            const dotProduct = worldNormal.dot(upVector);
            if (dotProduct > bestDotProduct) {
                bestDotProduct = dotProduct;
                bestFaceIndex = i;
            }
        }
        console.log(`Current upward-facing geometry face index: ${bestFaceIndex}`);
        console.log(`Dot product with up vector: ${bestDotProduct.toFixed(3)}`);
        console.log(`Mapping face index ${bestFaceIndex} to number ${faceNumber}`);
        // Update the face mapping immediately
        this.settings.faceMapping[bestFaceIndex] = faceNumber;
        console.log(`✅ Face ${faceNumber} calibrated! Geometry face ${bestFaceIndex} now maps to ${faceNumber}`);
        console.log('Updated face mapping:', this.settings.faceMapping);
        // Trigger a settings save through the plugin
        if (this.onCalibrationChanged) {
            this.onCalibrationChanged();
        }
        return true;
    }
    setClickthroughMode(enabled) {
        this.forceClickthroughMode = enabled;
        const canvas = this.renderer.domElement;
        if (enabled) {
            // Enable clickthrough - make canvas non-interactive
            canvas.style.pointerEvents = 'none';
            canvas.style.cursor = 'default';
        }
        else {
            // Disable clickthrough - make canvas interactive
            canvas.style.pointerEvents = 'auto';
            if (this.isHoveringDice) {
                canvas.style.cursor = 'grab';
            }
            else {
                canvas.style.cursor = 'default';
            }
        }
    }
    // Enhanced roll method with individual dice detection
    roll() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                try {
                    if (this.diceArray.length === 0) {
                        reject(new Error('No dice to roll'));
                        return;
                    }
                    console.log(`🎲 Starting enhanced roll with ${this.diceArray.length} dice`);
                    // Initialize dice states
                    this.initializeDiceStates();
                    // Apply physics impulse to all dice
                    this.applyRollForces();
                    // Start monitoring individual dice
                    this.startIndividualDiceMonitoring(resolve, reject);
                }
                catch (error) {
                    console.error('Roll error:', error);
                    reject(error);
                }
            });
        });
    }
    initializeDiceStates() {
        this.diceStates = [];
        for (let i = 0; i < this.diceArray.length; i++) {
            this.diceStates.push({
                index: i,
                type: this.diceTypeArray[i] || 'd20',
                isRolling: true,
                isCaught: false,
                isComplete: false,
                result: null,
                lastMotion: Date.now(),
                stableTime: 0
            });
        }
        console.log(`🎯 Initialized ${this.diceStates.length} dice states`);
    }
    applyRollForces() {
        this.diceBodyArray.forEach((body, index) => {
            if (body) {
                // Reset position to prevent stacking
                const spread = Math.min(this.diceArray.length * 0.3, 4);
                const angle = (index / this.diceArray.length) * Math.PI * 2;
                const radius = spread * 0.5;
                body.position.set(Math.cos(angle) * radius, 5 + Math.random() * 2, Math.sin(angle) * radius);
                // Apply random rotation
                body.quaternion.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
                body.quaternion.normalize();
                // Apply strong impulse force
                const forceMultiplier = 15 + Math.random() * 10;
                const force = new CANNON.Vec3((Math.random() - 0.5) * forceMultiplier, Math.random() * 5, (Math.random() - 0.5) * forceMultiplier);
                body.applyImpulse(force);
                // Apply random torque
                const torque = new CANNON.Vec3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20);
                body.applyTorque(torque);
                console.log(`🎲 Applied force to dice ${index}: force=${force.length().toFixed(2)}, torque=${torque.length().toFixed(2)}`);
            }
        });
    }
    startIndividualDiceMonitoring(resolve, reject) {
        const startTime = Date.now();
        const maxWaitTime = 15000; // Maximum 15 seconds
        const checkInterval = 100; // Check every 100ms
        const monitor = () => {
            try {
                const now = Date.now();
                let allComplete = true;
                let statusUpdate = '';
                // Check each die individually
                for (let i = 0; i < this.diceStates.length; i++) {
                    const state = this.diceStates[i];
                    const body = this.diceBodyArray[i];
                    if (!state.isComplete && body) {
                        // Calculate motion (velocity + angular velocity)
                        const linearVel = body.velocity.length();
                        const angularVel = body.angularVelocity.length();
                        const totalMotion = linearVel + angularVel;
                        // Check if dice has settled
                        if (totalMotion < this.settings.motionThreshold) {
                            if (state.stableTime === 0) {
                                state.stableTime = now;
                            }
                            else if (now - state.stableTime > 2000 && !state.isCaught && !state.isComplete) {
                                // Dice has been stable for 2 seconds - NOW check if it can be determined
                                const checkResult = this.checkDiceResult(i);
                                if (checkResult.isCaught) {
                                    // Face detection failed - dice is CAUGHT (don't mark as complete, wait for reroll)
                                    state.isCaught = true;
                                    state.isRolling = false;
                                    state.result = null; // No valid result
                                    console.log(`🥅 Dice ${i} (${state.type}) CAUGHT! Face confidence: ${checkResult.confidence.toFixed(3)}, required: ${checkResult.requiredConfidence.toFixed(3)}`);
                                    // Highlight immediately when caught
                                    this.highlightCaughtDice(i, true);
                                }
                                else {
                                    // Face detection succeeded - dice completes with result
                                    state.result = checkResult.result;
                                    state.isComplete = true;
                                    state.isRolling = false;
                                    console.log(`✅ Dice ${i} (${state.type}) settled with result: ${checkResult.result}`);
                                }
                            }
                        }
                        else {
                            // Dice is moving again - reset stability timer
                            state.stableTime = 0;
                            state.lastMotion = now;
                            // If dice was marked as caught but is moving again, give it another chance
                            if (state.isCaught) {
                                console.log(`🔄 Dice ${i} was caught but is moving again - clearing caught state`);
                                state.isCaught = false;
                                state.isRolling = true;
                                this.highlightCaughtDice(i, false);
                            }
                        }
                        if (!state.isComplete) {
                            allComplete = false;
                        }
                    }
                }
                // Update status
                const completed = this.diceStates.filter(d => d.isComplete).length;
                const caught = this.diceStates.filter(d => d.isCaught && !d.isComplete).length;
                const rolling = this.diceStates.filter(d => d.isRolling && !d.isCaught && !d.isComplete).length;
                statusUpdate = `Rolling: ${rolling}, Caught: ${caught}, Complete: ${completed}/${this.diceStates.length}`;
                // Only log status occasionally to avoid spam
                if (Math.random() < 0.1) {
                    console.log(`🎯 Status - ${statusUpdate}`);
                }
                // If there are caught dice, DON'T show results yet - wait for reroll
                if (caught > 0 && rolling === 0) {
                    // All dice have settled, but some are caught - wait for user to reroll
                    if (completed > 0 && Math.random() < 0.05) {
                        console.log(`⏸️ Waiting for reroll - ${caught} dice caught, ${completed} dice valid`);
                    }
                    // Continue monitoring but don't resolve
                    setTimeout(monitor, checkInterval);
                    return;
                }
                // Check if all dice are complete (and none are caught)
                if (allComplete && caught === 0) {
                    // All dice have valid results - show final result
                    const results = this.diceStates.map(d => d.result).filter(r => r !== null);
                    const total = results.reduce((sum, val) => sum + val, 0);
                    const breakdown = this.diceStates
                        .map((state, i) => `${state.type}=${state.result}`)
                        .join(' + ');
                    const resultString = `${breakdown} = ${total}`;
                    console.log(`🏆 All dice complete! Result: ${resultString}`);
                    // Clear monitoring state
                    this.currentMonitor = null;
                    this.diceStates = [];
                    resolve(resultString);
                    return;
                }
                // Check for timeout
                if (now - startTime > maxWaitTime) {
                    console.log(`⏰ Roll timeout after ${maxWaitTime / 1000}s`);
                    // Force completion with current results
                    const partialResults = this.diceStates.map((state, i) => {
                        if (state.result !== null) {
                            return state.result;
                        }
                        else {
                            // Force detect result for incomplete dice
                            return this.getTopFaceNumberForDice(i);
                        }
                    });
                    const total = partialResults.reduce((sum, val) => sum + val, 0);
                    const breakdown = partialResults
                        .map((result, i) => `${this.diceStates[i].type}=${result}`)
                        .join(' + ');
                    // Clear all highlights before resolving
                    this.clearAllHighlights();
                    // Clear monitoring state
                    this.currentMonitor = null;
                    this.diceStates = [];
                    resolve(`${breakdown} = ${total}`);
                    return;
                }
                // Continue monitoring
                setTimeout(monitor, checkInterval);
            }
            catch (error) {
                console.error('Monitoring error:', error);
                // Clear monitoring state on error
                this.currentMonitor = null;
                this.diceStates = [];
                reject(error);
            }
        };
        // Store the monitor function so it can be resumed after reroll
        this.currentMonitor = monitor;
        // Start monitoring
        monitor();
    }
    // Method to manually reroll caught dice
    rerollCaughtDice() {
        const caughtDice = this.diceStates.filter(d => d.isCaught && !d.isComplete);
        if (caughtDice.length === 0) {
            console.log('No caught dice to reroll');
            return false;
        }
        console.log(`🎲 Rerolling ${caughtDice.length} caught dice`);
        caughtDice.forEach(state => {
            const body = this.diceBodyArray[state.index];
            if (body) {
                // Remove highlight from caught dice
                this.highlightCaughtDice(state.index, false);
                // Reset dice state
                state.isCaught = false;
                state.isRolling = true;
                state.stableTime = 0;
                state.lastMotion = Date.now();
                // Apply new force to caught dice - ensure they fall down
                const forceMultiplier = 10 + Math.random() * 8;
                const force = new CANNON.Vec3((Math.random() - 0.5) * forceMultiplier, -5, // Strong downward force to prevent recatching
                (Math.random() - 0.5) * forceMultiplier);
                body.applyImpulse(force);
                console.log(`🔄 Rerolled dice ${state.index} with force ${force.length().toFixed(2)}`);
            }
        });
        return true;
    }
    // Get current dice status for UI updates
    getDiceStatus() {
        return this.diceStates.map(state => ({
            index: state.index,
            type: state.type,
            status: state.isComplete ? 'complete' :
                state.isCaught ? 'caught' :
                    state.isRolling ? 'rolling' : 'unknown',
            result: state.result || undefined
        }));
    }
    // Highlight caught dice with emissive glow
    highlightCaughtDice(index, highlight) {
        const dice = this.diceArray[index];
        if (!dice)
            return;
        if (highlight) {
            // Store original material if not already stored
            if (!this.originalMaterials.has(index)) {
                this.originalMaterials.set(index, dice.material);
            }
            // Create highlighted material with orange glow
            const currentMaterial = Array.isArray(dice.material) ? dice.material[0] : dice.material;
            const highlightedMaterial = currentMaterial.clone();
            highlightedMaterial.emissive.setHex(0xff6600); // Orange glow
            highlightedMaterial.emissiveIntensity = 0.8;
            dice.material = highlightedMaterial;
            console.log(`🔆 Highlighted caught dice ${index}`);
        }
        else {
            // Restore original material
            const originalMaterial = this.originalMaterials.get(index);
            if (originalMaterial) {
                dice.material = originalMaterial;
                this.originalMaterials.delete(index);
                console.log(`🔅 Removed highlight from dice ${index}`);
            }
        }
    }
    // Clear all highlights
    clearAllHighlights() {
        this.originalMaterials.forEach((originalMaterial, index) => {
            const dice = this.diceArray[index];
            if (dice) {
                dice.material = originalMaterial;
            }
        });
        this.originalMaterials.clear();
        console.log('🔅 Cleared all dice highlights');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZDIwLWRpY2UuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkMjAtZGljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsT0FBTyxLQUFLLEtBQUssTUFBTSxPQUFPLENBQUM7QUFDL0IsT0FBTyxLQUFLLE1BQU0sTUFBTSxXQUFXLENBQUM7QUFHcEMsTUFBTSxPQUFPLE9BQU87SUFzQ2hCLFlBQVksU0FBc0IsRUFBRSxRQUFzQjtRQS9CbEQsY0FBUyxHQUFHLEtBQUssQ0FBQztRQUVsQixnQkFBVyxHQUFrQixJQUFJLENBQUM7UUFDbEMsZ0JBQVcsR0FBMEIsSUFBSSxDQUFDO1FBQzFDLGVBQVUsR0FBRyxLQUFLLENBQUM7UUFDbkIsc0JBQWlCLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUNuQyxVQUFLLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDNUIsY0FBUyxHQUFHLElBQUksS0FBSyxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2xDLHNCQUFpQixHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUM1QyxrQkFBYSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDL0IsbUJBQWMsR0FBRyxLQUFLLENBQUM7UUFFdkIsZ0JBQVcsR0FBYSxFQUFFLENBQUM7UUFDM0IsZ0JBQVcsR0FBb0IsRUFBRSxDQUFDO1FBRTFDLDRCQUE0QjtRQUNwQixjQUFTLEdBQWlCLEVBQUUsQ0FBQztRQUM3QixrQkFBYSxHQUFrQixFQUFFLENBQUM7UUFDbEMsa0JBQWEsR0FBYSxFQUFFLENBQUM7UUFDN0IsaUJBQVksR0FBaUIsRUFBRSxDQUFDO1FBQ2hDLHFCQUFnQixHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3RCLGFBQVEsR0FBc0Is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LENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxTQUFTLEVBQUU7b0JBQzlDLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsU0FBUyxFQUFFO29CQUM5QyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsU0FBUyxFQUFFO29CQUMvQyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsU0FBUyxFQUFFO29CQUMvQyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsU0FBUyxFQUFFO29CQUMvQyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDLFNBQVMsRUFBRTtpQkFDakQsQ0FBQztZQUVOLEtBQUssS0FBSztnQkFDTixpREFBaUQ7Z0JBQ2pELE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ2pDLE1BQU0sUUFBUSxHQUFHO29CQUNiLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztvQkFDOUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO29CQUM5QyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7aUJBQ2pELENBQUM7Z0JBRUYsTUFBTSxLQUFLLEdBQUc7b0JBQ1YsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUM7b0JBQ3pELENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUN6RCxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENB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QUFFLFFBQVEsRUFBRTtZQUM3QyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFO1lBQzNDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUU7WUFDN0MsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRTtZQUM1QyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFO1lBQzdDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxPQUFPLEVBQUU7WUFDN0MsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNuRCxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ2xELEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxVQUFVLEVBQUU7WUFDaEQsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRTtZQUM1QyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFO1lBQzdDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUN2RCxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFO1NBQ2xELENBQUM7UUFFRixPQUFPLENBQUMsR0FBRyxD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RSxJQUFJLENBQUM7WUFDckMsRUFBRSxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDO1lBQ25DLEVBQUUsRUFBRSxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztZQUN0QyxFQUFFLEVBQUUsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7WUFDdEMsRUFBRSxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQztZQUNyQyxFQUFFLEVBQUUsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO1lBQ3JDLEVBQUUsRUFBRSxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDO1lBQ3BDLEVBQUUsRUFBRSxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLENBQUM7WUFDckMsRUFBRSxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUM7WUFDdkMsRUFBRSxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDO1lBQ25DLEVBQUUsRUFBRSxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUM7WUFDckMsRUFBRSxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUM7U0FDdkMsQ0FBQztRQUVGLE1BQU0sY0FBYyxH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QUFRLENBQUM7UUFFM0MsTUFBTSxhQUFhLEdBQW1DO1lBQ2xELENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUM7WUFDcEMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUM7WUFDbkMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLENBQUM7WUFDdEMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUM7WUFDbkMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUM7WUFDdEMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLENBQUMsSUFBSSxDQUFDO1lBQ3JDLENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDO1lBQ25DLENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDO1lBQ25DLENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQztZQUNyQyxFQUFFLEVBQUUsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7WUFDbkMsRUFBRSxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFB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QUFLLENBQUM7UUFDMUQsTUFBTSxZQUFZLEdBQUcsY0FBYyxDQUFDLENBQUMsQ0FBQyxjQUFjLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzFGLFlBQVksQ0FBQyxDQUFDLEdBQUcsUUFBUSxDQUFDO1FBRTFCLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzVDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUV0QyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxFQUFFLGdCQUFnQixDQUFDLENBQUMsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0csSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQyxDQUFDLEVBQUUsWUFBWSxDQUFDLENBQUMsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0UsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDcEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDM0MsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDakMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDbEMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDO1FBQ2hDLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQztRQUNyQyxJQUFJLENBQUMsUUFBUSxDQUFDLGNBQWMsR0FBRyxHQUFHLENBQUM7UUFDbkMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUMxQixDQUFDO0lBRU8sNkJBQTZCLENBQUMsVUFBNEI7UUFDOUQsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUU7WUFDcEIsT0FBTyxDQUFDLENBQUM7U0FDWjtRQUVELE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDO1FBQ2hFLElBQUksQ0FBQyxpQkFBaUIsRUFBRTtZQUNwQixPQUFPLENBQUMsQ0FBQztTQUNaO1FBRUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDbkMsSUFBSSxJQUFJLEdBQUcsUUFBUSxDQUFDO1FBRXBCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxpQkFBaUIsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDOUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQ2pELE1BQU0sQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLENBQUM7WUFDbkMsSUFBSSxNQUFNLENBQUMsQ0FBQyxHQUFHLElBQUksRUFBRTtnQkFDakIsSUFBSSxHQUFHLE1BQU0sQ0FBQyxDQUFDLENBQUM7YUFDbkI7U0FDSjtRQUVELE9BQU8sSUFBSSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7SUFDeEMsQ0FBQztJQUVPLGlCQUFpQjtRQUNyQixNQUFNLFdBQVcsR0FBRyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztRQUU1QyxvREFBb0Q7UUFFcEQsTUFBTSxhQUFhLEdBQW1DO1lBQ2xELENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUM7WUFDcEMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUM7WUFDbkMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUM7WUFDbkMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUM7WUFDbkMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsRUFBRSxDQUFDLEdBQUcsQ0FBQztZQUNwQyxDQUFDLEVBQUUsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7WUFDbEMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUM7WUFDbkMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUM7WUFDbkMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDO1lBQ2xDLEVBQUUsRUFBRSxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztZQUNuQyxFQUFFLEVBQUUsSUFBSSxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUM7WUFDbkMsRUFBRSxFQUFFLElBQUksS0FBSyxDQUFDLEtBQUssQ0FB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bnRlbnQiOlsiaW1wb3J0ICogYXMgVEhSRUUgZnJvbSAndGhyZWUnO1xyXG5pbXBvcnQgKiBhcyBDQU5OT04gZnJvbSAnY2Fubm9uLWVzJztcclxuaW1wb3J0IHsgRGljZVNldHRpbmdzIH0gZnJvbSAnLi9zZXR0aW5ncyc7XHJcblxyXG5leHBvcnQgY2xhc3MgRDIwRGljZSB7XHJcbiAgICBwcml2YXRlIHNjZW5lOiBUSFJFRS5TY2VuZTtcclxuICAgIHByaXZhdGUgY2FtZXJhOiBUSFJFRS5PcnRob2dyYXBoaWNDYW1lcmE7XHJcbiAgICBwcml2YXRlIHJlbmRlcmVyOiBUSFJFRS5XZWJHTFJlbmRlcmVyO1xyXG4gICAgcHJpdmF0ZSBkaWNlOiBUSFJFRS5NZXNoO1xyXG4gICAgcHJpdmF0ZSBkaWNlQm9keTogQ0FOTk9OLkJvZHk7XHJcbiAgICBwcml2YXRlIHdvcmxkOiBDQU5OT04uV29ybGQ7XHJcbiAgICBwcml2YXRlIGlzUm9sbGluZyA9IGZhbHNlO1xyXG4gICAgcHJpdmF0ZSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xyXG4gICAgcHJpdmF0ZSBhbmltYXRpb25JZDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIHJvbGxUaW1lb3V0OiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBpc0RyYWdnaW5nID0gZmFsc2U7XHJcbiAgICBwcml2YXRlIGRyYWdTdGFydFBvc2l0aW9uID0geyB4OiAwLCB5OiAwIH07XHJcbiAgICBwcml2YXRlIG1vdXNlID0gbmV3IFRIUkVFLlZlY3RvcjIoKTtcclxuICAgIHByaXZhdGUgcmF5Y2FzdGVyID0gbmV3IFRIUkVFLlJheWNhc3RlcigpO1xyXG4gICAgcHJpdmF0ZSBsYXN0TW91c2VQb3NpdGlvbiA9IHsgeDogMCwgeTogMCwgdGltZTogMCB9O1xyXG4gICAgcHJpdmF0ZSBtb3VzZVZlbG9jaXR5ID0geyB4OiAwLCB5OiAwIH07XHJcbiAgICBwcml2YXRlIGlzSG92ZXJpbmdEaWNlID0gZmFsc2U7XHJcbiAgICBwcml2YXRlIGRpY2VHZW9tZXRyeTogVEhSRUUuSWNvc2FoZWRyb25HZW9tZXRyeTtcclxuICAgIHByaXZhdGUgZmFjZU51bWJlcnM6IG51bWJlcltdID0gW107XHJcbiAgICBwcml2YXRlIGZhY2VOb3JtYWxzOiBUSFJFRS5WZWN0b3IzW10gPSBbXTtcclxuICAgIHByaXZhdGUgc2V0dGluZ3M6IERpY2VTZXR0aW5ncztcclxuICAgIC8vIE11bHRpLWRpY2Ugc3VwcG9ydCBhcnJheXNcclxuICAgIHByaXZhdGUgZGljZUFycmF5OiBUSFJFRS5NZXNoW10gPSBbXTtcclxuICAgIHByaXZhdGUgZGljZUJvZHlBcnJheTogQ0FOTk9OLkJvZHlbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBkaWNlVHlwZUFycmF5OiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBzZWxlY3RlZERpY2U6IFRIUkVFLk1lc2hbXSA9IFtdO1xyXG4gICAgcHJpdmF0ZSBkcmFnZ2VkRGljZUluZGV4ID0gLTE7XHJcbiAgICBwcml2YXRlIHRyYXlNZXNoOiBUSFJFRS5NZXNoIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIHdpbmRvd0JvcmRlcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgaG92ZXJDaXJjbGU6IFRIUkVFLk1lc2ggfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgaG92ZXJDaXJjbGVNYXRlcmlhbDogVEhSRUUuTWVzaEJhc2ljTWF0ZXJpYWwgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgZmxvb3JIZWlnaHQgPSAtMi40O1xyXG4gICAgcHJpdmF0ZSBmb3JjZUNsaWNrdGhyb3VnaE1vZGUgPSBmYWxzZTtcclxuICAgIHB1YmxpYyBvblJvbGxDb21wbGV0ZTogKChyZXN1bHQ6IG51bWJlciB8IHN0cmluZykgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgYW1iaWVudExpZ2h0OiBUSFJFRS5BbWJpZW50TGlnaHQgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgZGlyZWN0aW9uYWxMaWdodDogVEhSRUUuRGlyZWN0aW9uYWxMaWdodCB8IG51bGwgPSBudWxsO1xyXG5cclxuICAgIGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHNldHRpbmdzOiBEaWNlU2V0dGluZ3MpIHtcclxuICAgICAgICB0aGlzLmNvbnRhaW5lciA9IGNvbnRhaW5lcjtcclxuICAgICAgICB0aGlzLnNldHRpbmdzID0gc2V0dGluZ3M7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ/CfjrIgRDIwRGljZSBpbml0aWFsaXplZCB3aXRoIHNldHRpbmdzOicsIHtcclxuICAgICAgICAgICAgbW90aW9uVGhyZXNob2xkOiBzZXR0aW5ncy5tb3Rpb25UaHJlc2hvbGQsXHJcbiAgICAgICAgICAgIGVuYWJsZVJlc3VsdEFuaW1hdGlvbjogc2V0dGluZ3MuZW5hYmxlUmVzdWx0QW5pbWF0aW9uLFxyXG4gICAgICAgICAgICBkaWNlU2l6ZTogc2V0dGluZ3MuZGljZVNpemVcclxuICAgICAgICB9KTtcclxuICAgICAgICB0aGlzLmluaXQoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGluaXQoKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgLy8gSW5pdGlhbGl6ZSBUaHJlZS5qcyBzY2VuZSB3aXRoIHRyYW5zcGFyZW50IGJhY2tncm91bmRcclxuICAgICAgICAgICAgdGhpcy5zY2VuZSA9IG5ldyBUSFJFRS5TY2VuZSgpO1xyXG4gICAgICAgICAgICAvLyBObyBiYWNrZ3JvdW5kIGNvbG9yIC0gd2lsbCBiZSB0cmFuc3BhcmVudFxyXG5cclxuICAgICAgICAgICAgLy8gU2V0dXAgb3J0aG9ncmFwaGljIGNhbWVyYSAtIHdpbGwgYmUgcHJvcGVybHkgc2l6ZWQgaW4gdXBkYXRlU2l6ZVxyXG4gICAgICAgICAgICBjb25zdCBhc3BlY3QgPSB3aW5kb3cuaW5uZXJXaWR0aCAvICh3aW5kb3cuaW5uZXJIZWlnaHQgLSA0NCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGZydXN0dW1TaXplID0gMjA7XHJcbiAgICAgICAgICAgIHRoaXMuY2FtZXJhID0gbmV3IFRIUkVFLk9ydGhvZ3JhcGhpY0NhbWVyYShcclxuICAgICAgICAgICAgICAgIC1mcnVzdHVtU2l6ZSAqIGFzcGVjdCAvIDIsIGZydXN0dW1TaXplICogYXNwZWN0IC8gMixcclxuICAgICAgICAgICAgICAgIGZydXN0dW1TaXplIC8gMiwgLWZydXN0dW1TaXplIC8gMixcclxuICAgICAgICAgICAgICAgIDAuMSwgMTAwMFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5wb3NpdGlvbi5zZXQoMCwgMjAsIDApO1xyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYS5sb29rQXQoMCwgLTIsIDApO1xyXG4gICAgICAgICAgICB0aGlzLmNhbWVyYS51cC5zZXQoMCwgMCwgLTEpO1xyXG5cclxuICAgICAgICAgICAgLy8gU2V0dXAgcmVuZGVyZXIgdG8gZmlsbCBjb250YWluZXJcclxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlciA9IG5ldyBUSFJFRS5XZWJHTFJlbmRlcmVyKHtcclxuICAgICAgICAgICAgICAgIGFudGlhbGlhczogdHJ1ZSxcclxuICAgICAgICAgICAgICAgIGFscGhhOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgcHJlc2VydmVEcmF3aW5nQnVmZmVyOiBmYWxzZSxcclxuICAgICAgICAgICAgICAgIHBvd2VyUHJlZmVyZW5jZTogXCJoaWdoLXBlcmZvcm1hbmNlXCJcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIC8vIENvbmZpZ3VyZSBzaGFkb3cgbWFwcGluZyBiYXNlZCBvbiBzZXR0aW5nc1xyXG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC5lbmFibGVkID0gdGhpcy5zZXR0aW5ncy5lbmFibGVTaGFkb3dzO1xyXG4gICAgICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC50eXBlID0gVEhSRUUuUENGU29mdFNoYWRvd01hcDsgLy8gU29mdCBzaGFkb3dzIGZvciBiZXR0ZXIgcXVhbGl0eVxyXG5cclxuICAgICAgICAgICAgLy8gQWRkIFdlYkdMIGNvbnRleHQgbG9zcy9yZXN0b3JlIGhhbmRsZXJzXHJcbiAgICAgICAgICAgIGNvbnN0IGNhbnZhcyA9IHRoaXMucmVuZGVyZXIuZG9tRWxlbWVudDtcclxuICAgICAgICAgICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ3dlYmdsY29udGV4dGxvc3QnLCAoZXZlbnQpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignV2ViR0wgY29udGV4dCBsb3N0LCBhdHRlbXB0aW5nIHRvIHByZXZlbnQgZGVmYXVsdCcpO1xyXG4gICAgICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignd2ViZ2xjb250ZXh0cmVzdG9yZWQnLCAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnV2ViR0wgY29udGV4dCByZXN0b3JlZCwgcmVpbml0aWFsaXppbmcgc2NlbmUnKTtcclxuICAgICAgICAgICAgICAgIHRoaXMucmVpbml0aWFsaXplQWZ0ZXJDb250ZXh0TG9zcygpO1xyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKGNhbnZhcyk7XHJcblxyXG4gICAgICAgICAgICAvLyBDcmVhdGUgd2luZG93IGJvcmRlciBpZiBlbmFibGVkXHJcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlV2luZG93Qm9yZGVyKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBTZXQgaW5pdGlhbCBzaXplIHRvIGZpbGwgY29udGFpbmVyXHJcbiAgICAgICAgICAgIHRoaXMuc2V0SW5pdGlhbFNpemUoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFNldHVwIGRyYWcgY29udHJvbHMgYW5kIG1vdXNlIGludGVyYWN0aW9uc1xyXG4gICAgICAgICAgICB0aGlzLnNldHVwRHJhZ0NvbnRyb2xzKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBJbml0aWFsaXplIHBoeXNpY3Mgd29ybGRcclxuICAgICAgICAgICAgdGhpcy5pbml0UGh5c2ljcygpO1xyXG5cclxuICAgICAgICAgICAgLy8gQ3JlYXRlIHRyYXkgYnV0IG5vIGluaXRpYWwgZGljZSAobXVsdGktZGljZSBzeXN0ZW0pXHJcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlRGljZVRyYXkoKTtcclxuICAgICAgICAgICAgdGhpcy5zZXR1cExpZ2h0aW5nKCk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmFuaW1hdGUoKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gaW5pdGlhbGl6ZSBEMjAgZGljZTonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGRldGFpbHM6JywgZXJyb3IubWVzc2FnZSwgZXJyb3Iuc3RhY2spO1xyXG4gICAgICAgICAgICB0aGlzLmNvbnRhaW5lci5pbm5lckhUTUwgPSBgPGRpdiBzdHlsZT1cImRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGp1c3RpZnktY29udGVudDogY2VudGVyOyBoZWlnaHQ6IDEwMCU7IGNvbG9yOiB2YXIoLS10ZXh0LW11dGVkKTtcIj4zRCByZW5kZXJpbmcgbm90IGF2YWlsYWJsZTxicj48c21hbGw+RXJyb3I6ICR7ZXJyb3IubWVzc2FnZX08L3NtYWxsPjwvZGl2PmA7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgaW5pdFBoeXNpY3MoKSB7XHJcbiAgICAgICAgdGhpcy53b3JsZCA9IG5ldyBDQU5OT04uV29ybGQoKTtcclxuICAgICAgICB0aGlzLndvcmxkLmdyYXZpdHkuc2V0KDAsIC05LjgyLCAwKTsgLy8gUmVhbGlzdGljIEVhcnRoIGdyYXZpdHkgKDkuODIgbS9zwrIpXHJcbiAgICAgICAgY29uc29sZS5sb2coYPCfjI0gUGh5c2ljcyB3b3JsZCBpbml0aWFsaXplZCB3aXRoIGdyYXZpdHk6ICR7dGhpcy53b3JsZC5ncmF2aXR5Lnl9YCk7XHJcblxyXG4gICAgICAgIC8vIFNldCB1cCBhZHZhbmNlZCBwaHlzaWNzIGZvciBtb3JlIGFjY3VyYXRlIHNpbXVsYXRpb25cclxuICAgICAgICB0aGlzLndvcmxkLmJyb2FkcGhhc2UudXNlQm91bmRpbmdCb3hlcyA9IHRydWU7XHJcbiAgICAgICAgdGhpcy53b3JsZC5kZWZhdWx0Q29udGFjdE1hdGVyaWFsLmNvbnRhY3RFcXVhdGlvblN0aWZmbmVzcyA9IDFlNztcclxuICAgICAgICB0aGlzLndvcmxkLmRlZmF1bHRDb250YWN0TWF0ZXJpYWwuY29udGFjdEVxdWF0aW9uUmVsYXhhdGlvbiA9IDQ7XHJcbiAgICAgICAgdGhpcy53b3JsZC5icm9hZHBoYXNlID0gbmV3IENBTk5PTi5OYWl2ZUJyb2FkcGhhc2UoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNyZWF0ZURpY2VUcmF5KCkge1xyXG4gICAgICAgIC8vIENyZWF0ZSB2aXN1YWwgdHJheSBiYXNlZCBvbiBzZXR0aW5nc1xyXG4gICAgICAgIGlmICh0aGlzLnNldHRpbmdzLnNob3dTdXJmYWNlKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHRyYXlXaWR0aCA9IDMyICogdGhpcy5zZXR0aW5ncy50cmF5V2lkdGg7XHJcbiAgICAgICAgICAgIGNvbnN0IHRyYXlMZW5ndGggPSAyNCAqIHRoaXMuc2V0dGluZ3MudHJheUxlbmd0aDtcclxuICAgICAgICAgICAgY29uc3QgdHJheUdlb21ldHJ5ID0gbmV3IFRIUkVFLkJveEdlb21ldHJ5KHRyYXlXaWR0aCwgMC44LCB0cmF5TGVuZ3RoKTtcclxuICAgICAgICAgICAgY29uc3QgdHJheU1hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hQaG9uZ01hdGVyaWFsKHtcclxuICAgICAgICAgICAgICAgIGNvbG9yOiB0aGlzLnNldHRpbmdzLnN1cmZhY2VDb2xvcixcclxuICAgICAgICAgICAgICAgIHRyYW5zcGFyZW50OiB0aGlzLnNldHRpbmdzLnN1cmZhY2VPcGFjaXR5IDwgMSxcclxuICAgICAgICAgICAgICAgIG9wYWNpdHk6IHRoaXMuc2V0dGluZ3Muc3VyZmFjZU9wYWNpdHlcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIHRoaXMudHJheU1lc2ggPSBuZXcgVEhSRUUuTWVzaCh0cmF5R2VvbWV0cnksIHRyYXlNYXRlcmlhbCk7XHJcbiAgICAgICAgICAgIHRoaXMudHJheU1lc2gucG9zaXRpb24uc2V0KDAsIC0yLCAwKTtcclxuICAgICAgICAgICAgdGhpcy50cmF5TWVzaC5yZWNlaXZlU2hhZG93ID0gdGhpcy5zZXR0aW5ncy5zdXJmYWNlUmVjZWl2ZVNoYWRvdztcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy50cmF5TWVzaCk7XHJcblxyXG4gICAgICAgICAgICAvLyBBZGQgYm9yZGVyIGlmIGVuYWJsZWQgKHVzaW5nIHRyYXkncyBvd24gYm9yZGVyIHNldHRpbmdzKVxyXG4gICAgICAgICAgICBpZiAodGhpcy5zZXR0aW5ncy5zdXJmYWNlQm9yZGVyV2lkdGggPiAwICYmIHRoaXMuc2V0dGluZ3Muc3VyZmFjZUJvcmRlck9wYWNpdHkgPiAwKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBib3JkZXJHZW9tZXRyeSA9IG5ldyBUSFJFRS5FZGdlc0dlb21ldHJ5KHRyYXlHZW9tZXRyeSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBib3JkZXJNYXRlcmlhbCA9IG5ldyBUSFJFRS5MaW5lQmFzaWNNYXRlcmlhbCh7XHJcbiAgICAgICAgICAgICAgICAgICAgY29sb3I6IHRoaXMuc2V0dGluZ3Muc3VyZmFjZUJvcmRlckNvbG9yLFxyXG4gICAgICAgICAgICAgICAgICAgIHRyYW5zcGFyZW50OiB0aGlzLnNldHRpbmdzLnN1cmZhY2VCb3JkZXJPcGFjaXR5IDwgMSxcclxuICAgICAgICAgICAgICAgICAgICBvcGFjaXR5OiB0aGlzLnNldHRpbmdzLnN1cmZhY2VCb3JkZXJPcGFjaXR5LFxyXG4gICAgICAgICAgICAgICAgICAgIGxpbmV3aWR0aDogdGhpcy5zZXR0aW5ncy5zdXJmYWNlQm9yZGVyV2lkdGhcclxuICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYm9yZGVyTGluZXMgPSBuZXcgVEhSRUUuTGluZVNlZ21lbnRzKGJvcmRlckdlb21ldHJ5LCBib3JkZXJNYXRlcmlhbCk7XHJcbiAgICAgICAgICAgICAgICBib3JkZXJMaW5lcy5wb3NpdGlvbi5jb3B5KHRoaXMudHJheU1lc2gucG9zaXRpb24pO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zY2VuZS5hZGQoYm9yZGVyTGluZXMpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBQaHlzaWNzIHRyYXkgZmxvb3IgLSByZWFsaXN0aWMgZmVsdCBzdXJmYWNlXHJcbiAgICAgICAgY29uc3QgZmxvb3JNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ2Zsb29yJyk7XHJcbiAgICAgICAgZmxvb3JNYXRlcmlhbC5yZXN0aXR1dGlvbiA9IDAuMjU7ICAvLyBGZWx0IGFic29yYnMgZW5lcmd5IChsb3cgYm91bmNlKVxyXG4gICAgICAgIGZsb29yTWF0ZXJpYWwuZnJpY3Rpb24gPSAwLjc7ICAgICAgLy8gRmVsdCBoYXMgaGlnaCBmcmljdGlvblxyXG5cclxuICAgICAgICBjb25zdCBmbG9vclNoYXBlID0gbmV3IENBTk5PTi5QbGFuZSgpO1xyXG4gICAgICAgIGNvbnN0IGZsb29yQm9keSA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAsIG1hdGVyaWFsOiBmbG9vck1hdGVyaWFsIH0pO1xyXG4gICAgICAgIGZsb29yQm9keS5hZGRTaGFwZShmbG9vclNoYXBlKTtcclxuICAgICAgICBmbG9vckJvZHkucXVhdGVybmlvbi5zZXRGcm9tQXhpc0FuZ2xlKG5ldyBDQU5OT04uVmVjMygxLCAwLCAwKSwgLU1hdGguUEkgLyAyKTtcclxuICAgICAgICBmbG9vckJvZHkucG9zaXRpb24uc2V0KDAsIC0yLjQsIDApO1xyXG4gICAgICAgIHRoaXMuZmxvb3JIZWlnaHQgPSBmbG9vckJvZHkucG9zaXRpb24ueTtcclxuICAgICAgICB0aGlzLndvcmxkLmFkZEJvZHkoZmxvb3JCb2R5KTtcclxuXHJcbiAgICAgICAgLy8gUGh5c2ljcyB0cmF5IHdhbGxzIC0gcmVhbGlzdGljIHdvb2QvcGxhc3RpYyB3YWxsc1xyXG4gICAgICAgIGNvbnN0IHdhbGxNYXRlcmlhbCA9IG5ldyBDQU5OT04uTWF0ZXJpYWwoJ3dhbGwnKTtcclxuICAgICAgICB3YWxsTWF0ZXJpYWwucmVzdGl0dXRpb24gPSAwLjQ1OyAgLy8gTW9kZXJhdGUgYm91bmNlIG9mZiB3YWxsc1xyXG4gICAgICAgIHdhbGxNYXRlcmlhbC5mcmljdGlvbiA9IDAuMzsgICAgICAvLyBTbW9vdGggd2FsbCBzdXJmYWNlXHJcblxyXG4gICAgICAgIC8vIENhbGN1bGF0ZSB3YWxsIGRpbWVuc2lvbnMgYmFzZWQgb24gdHJheSBzZXR0aW5nc1xyXG4gICAgICAgIGNvbnN0IHRyYXlXaWR0aCA9IDMyICogdGhpcy5zZXR0aW5ncy50cmF5V2lkdGg7XHJcbiAgICAgICAgY29uc3QgdHJheUxlbmd0aCA9IDI0ICogdGhpcy5zZXR0aW5ncy50cmF5TGVuZ3RoO1xyXG4gICAgICAgIGNvbnN0IGhhbGZXaWR0aCA9IHRyYXlXaWR0aCAvIDI7XHJcbiAgICAgICAgY29uc3QgaGFsZkxlbmd0aCA9IHRyYXlMZW5ndGggLyAyO1xyXG5cclxuICAgICAgICAvLyBMZWZ0IHdhbGxcclxuICAgICAgICBjb25zdCBsZWZ0V2FsbFNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKDAuMiwgNCwgaGFsZkxlbmd0aCkpO1xyXG4gICAgICAgIGNvbnN0IGxlZnRXYWxsID0gbmV3IENBTk5PTi5Cb2R5KHsgbWFzczogMCwgbWF0ZXJpYWw6IHdhbGxNYXRlcmlhbCB9KTtcclxuICAgICAgICBsZWZ0V2FsbC5hZGRTaGFwZShsZWZ0V2FsbFNoYXBlKTtcclxuICAgICAgICBsZWZ0V2FsbC5wb3NpdGlvbi5zZXQoLWhhbGZXaWR0aCwgMCwgMCk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KGxlZnRXYWxsKTtcclxuXHJcbiAgICAgICAgLy8gUmlnaHQgd2FsbFxyXG4gICAgICAgIGNvbnN0IHJpZ2h0V2FsbFNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKDAuMiwgNCwgaGFsZkxlbmd0aCkpO1xyXG4gICAgICAgIGNvbnN0IHJpZ2h0V2FsbCA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAsIG1hdGVyaWFsOiB3YWxsTWF0ZXJpYWwgfSk7XHJcbiAgICAgICAgcmlnaHRXYWxsLmFkZFNoYXBlKHJpZ2h0V2FsbFNoYXBlKTtcclxuICAgICAgICByaWdodFdhbGwucG9zaXRpb24uc2V0KGhhbGZXaWR0aCwgMCwgMCk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KHJpZ2h0V2FsbCk7XHJcblxyXG4gICAgICAgIC8vIEZyb250IHdhbGxcclxuICAgICAgICBjb25zdCBmcm9udFdhbGxTaGFwZSA9IG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhoYWxmV2lkdGgsIDQsIDAuMikpO1xyXG4gICAgICAgIGNvbnN0IGZyb250V2FsbCA9IG5ldyBDQU5OT04uQm9keSh7IG1hc3M6IDAsIG1hdGVyaWFsOiB3YWxsTWF0ZXJpYWwgfSk7XHJcbiAgICAgICAgZnJvbnRXYWxsLmFkZFNoYXBlKGZyb250V2FsbFNoYXBlKTtcclxuICAgICAgICBmcm9udFdhbGwucG9zaXRpb24uc2V0KDAsIDAsIGhhbGZMZW5ndGgpO1xyXG4gICAgICAgIHRoaXMud29ybGQuYWRkQm9keShmcm9udFdhbGwpO1xyXG5cclxuICAgICAgICAvLyBCYWNrIHdhbGxcclxuICAgICAgICBjb25zdCBiYWNrV2FsbFNoYXBlID0gbmV3IENBTk5PTi5Cb3gobmV3IENBTk5PTi5WZWMzKGhhbGZXaWR0aCwgNCwgMC4yKSk7XHJcbiAgICAgICAgY29uc3QgYmFja1dhbGwgPSBuZXcgQ0FOTk9OLkJvZHkoeyBtYXNzOiAwLCBtYXRlcmlhbDogd2FsbE1hdGVyaWFsIH0pO1xyXG4gICAgICAgIGJhY2tXYWxsLmFkZFNoYXBlKGJhY2tXYWxsU2hhcGUpO1xyXG4gICAgICAgIGJhY2tXYWxsLnBvc2l0aW9uLnNldCgwLCAwLCAtaGFsZkxlbmd0aCk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KGJhY2tXYWxsKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNyZWF0ZURpY2UoKSB7XHJcbiAgICAgICAgLy8gRElTQUJMRUQ6IExlZ2FjeSBzaW5nbGUtZGljZSBjcmVhdGlvbiBtZXRob2RcclxuICAgICAgICAvLyBNdWx0aS1kaWNlIHN5c3RlbSB1c2VzIGNyZWF0ZVNpbmdsZURpY2UoKSBpbnN0ZWFkXHJcbiAgICAgICAgY29uc29sZS5sb2coJ2NyZWF0ZURpY2UoKSBjYWxsZWQgYnV0IGRpc2FibGVkIGZvciBtdWx0aS1kaWNlIHN5c3RlbScpO1xyXG4gICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIGEgYmFzaWMgZmFsbGJhY2sgbWF0ZXJpYWwgd2l0aCBhbGwgY29uZmlndXJlZCBwcm9wZXJ0aWVzXHJcbiAgICAgICAgY29uc3QgZmFsbGJhY2tNYXRlcmlhbFByb3BzOiBhbnkgPSB7XHJcbiAgICAgICAgICAgIGNvbG9yOiB0aGlzLnNldHRpbmdzLmRpY2VDb2xvcixcclxuICAgICAgICAgICAgc2hpbmluZXNzOiB0aGlzLnNldHRpbmdzLmRpY2VTaGluaW5lc3MsXHJcbiAgICAgICAgICAgIHNwZWN1bGFyOiB0aGlzLnNldHRpbmdzLmRpY2VTcGVjdWxhcixcclxuICAgICAgICAgICAgdHJhbnNwYXJlbnQ6IHRoaXMuc2V0dGluZ3MuZGljZVRyYW5zcGFyZW50LFxyXG4gICAgICAgICAgICBvcGFjaXR5OiB0aGlzLnNldHRpbmdzLmRpY2VPcGFjaXR5XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gQWRkIG5vcm1hbCBtYXAgdG8gZmFsbGJhY2sgbWF0ZXJpYWwgaWYgYXZhaWxhYmxlXHJcbiAgICAgICAgY29uc3Qgbm9ybWFsTWFwRGF0YSA9IHRoaXMuZ2V0Q3VycmVudERpY2VOb3JtYWxNYXBEYXRhKCk7XHJcbiAgICAgICAgaWYgKG5vcm1hbE1hcERhdGEpIHtcclxuICAgICAgICAgICAgY29uc3Qgbm9ybWFsTWFwID0gdGhpcy5sb2FkTm9ybWFsTWFwKG5vcm1hbE1hcERhdGEpO1xyXG4gICAgICAgICAgICBpZiAobm9ybWFsTWFwKSB7XHJcbiAgICAgICAgICAgICAgICBmYWxsYmFja01hdGVyaWFsUHJvcHMubm9ybWFsTWFwID0gbm9ybWFsTWFwO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBmYWxsYmFja01hdGVyaWFsID0gbmV3IFRIUkVFLk1lc2hQaG9uZ01hdGVyaWFsKGZhbGxiYWNrTWF0ZXJpYWxQcm9wcyk7XHJcblxyXG4gICAgICAgIHRoaXMuZGljZSA9IG5ldyBUSFJFRS5NZXNoKHRoaXMuZGljZUdlb21ldHJ5LCBmYWxsYmFja01hdGVyaWFsKTtcclxuXHJcbiAgICAgICAgLy8gRW5zdXJlIGRpY2UgaXMgdmlzaWJsZSBieSBtYWtpbmcgaXQgcmVhc29uYWJseSBzaXplZFxyXG4gICAgICAgIGNvbnNvbGUubG9nKGBDcmVhdGluZyBkaWNlIHdpdGggc2l6ZTogJHt0aGlzLnNldHRpbmdzLmRpY2VTaXplfSwgdHlwZTogJHt0aGlzLnNldHRpbmdzLmRpY2VUeXBlfWApO1xyXG4gICAgICAgIHRoaXMuZGljZS5jYXN0U2hhZG93ID0gdGhpcy5zZXR0aW5ncy5kaWNlQ2FzdFNoYWRvdztcclxuICAgICAgICB0aGlzLmRpY2UucmVjZWl2ZVNoYWRvdyA9IHRoaXMuc2V0dGluZ3MuZGljZVJlY2VpdmVTaGFkb3c7XHJcbiAgICAgICAgdGhpcy5kaWNlLnBvc2l0aW9uLnNldCgwLCAyLCAwKTtcclxuICAgICAgICB0aGlzLnNjZW5lLmFkZCh0aGlzLmRpY2UpO1xyXG5cclxuICAgICAgICAvLyBJbml0aWFsaXplIGZhY2UgbnVtYmVycyBmb3IgZDIwICgxLTIwIG1hcHBlZCB0byBmYWNlcylcclxuICAgICAgICB0aGlzLmluaXRpYWxpemVGYWNlTnVtYmVycygpO1xyXG5cclxuICAgICAgICAvLyBOT1RFOiBMZWdhY3kgc2luZ2xlLWRpY2UgcGh5c2ljcyBkaXNhYmxlZCBmb3IgbXVsdGktZGljZSBzeXN0ZW1cclxuICAgICAgICAvLyB0aGlzLmNyZWF0ZVBoeXNpY3NCb2R5KCk7XHJcblxyXG4gICAgICAgIC8vIENhbGN1bGF0ZSBmYWNlIG5vcm1hbHMgZm9yIHRoZSBkaWNlIHR5cGVcclxuICAgICAgICB0aGlzLmNhbGN1bGF0ZUZhY2VOb3JtYWxzKCk7XHJcblxyXG4gICAgICAgIHRoaXMuYWRkRGljZVRleHR1cmVzKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjcmVhdGVEaWNlR2VvbWV0cnkoKTogVEhSRUUuQnVmZmVyR2VvbWV0cnkge1xyXG4gICAgICAgIGxldCBnZW9tZXRyeTogVEhSRUUuQnVmZmVyR2VvbWV0cnk7XHJcblxyXG4gICAgICAgIHN3aXRjaCAodGhpcy5zZXR0aW5ncy5kaWNlVHlwZSkge1xyXG4gICAgICAgICAgICBjYXNlICdkNCc6XHJcbiAgICAgICAgICAgICAgICBnZW9tZXRyeSA9IG5ldyBUSFJFRS5UZXRyYWhlZHJvbkdlb21ldHJ5KHRoaXMuc2V0dGluZ3MuZGljZVNpemUsIDApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hcHBseVRldHJhaGVkcm9uVVZNYXBwaW5nKGdlb21ldHJ5KTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBnZW9tZXRyeTtcclxuICAgICAgICAgICAgY2FzZSAnZDYnOlxyXG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQm94R2VvbWV0cnkodGhpcy5zZXR0aW5ncy5kaWNlU2l6ZSAqIDIsIHRoaXMuc2V0dGluZ3MuZGljZVNpemUgKiAyLCB0aGlzLnNldHRpbmdzLmRpY2VTaXplICogMik7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFwcGx5U3F1YXJlVVZNYXBwaW5nKGdlb21ldHJ5KTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBnZW9tZXRyeTtcclxuICAgICAgICAgICAgY2FzZSAnZDgnOlxyXG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuT2N0YWhlZHJvbkdlb21ldHJ5KHRoaXMuc2V0dGluZ3MuZGljZVNpemUsIDApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5hcHBseVRyaWFuZ2xlVVZNYXBwaW5nKGdlb21ldHJ5LCA4KTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBnZW9tZXRyeTtcclxuICAgICAgICAgICAgY2FzZSAnZDEwJzoge1xyXG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkgPSB0aGlzLmNyZWF0ZUQxMFBvbHloZWRyb25HZW9tZXRyeSh0aGlzLnNldHRpbmdzLmRpY2VTaXplKTtcclxuICAgICAgICAgICAgICAgIC8vIEFwcGx5IFVWIG1hcHBpbmcgZm9yIEQxMCAoMTAga2l0ZS1zaGFwZWQgZmFjZXMpXHJcbiAgICAgICAgICAgICAgICB0aGlzLmFwcGx5RDEwVVZNYXBwaW5nKGdlb21ldHJ5KTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBnZW9tZXRyeTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjYXNlICdkMTInOlxyXG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuRG9kZWNhaGVkcm9uR2VvbWV0cnkodGhpcy5zZXR0aW5ncy5kaWNlU2l6ZSwgMCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmFwcGx5RDEyUGVudGFnb25VVk1hcHBpbmcoZ2VvbWV0cnkpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGdlb21ldHJ5O1xyXG4gICAgICAgICAgICBjYXNlICdkMjAnOlxyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuSWNvc2FoZWRyb25HZW9tZXRyeSh0aGlzLnNldHRpbmdzLmRpY2VTaXplLCAwKTtcclxuICAgICAgICAgICAgICAgIHRoaXMuYXBwbHlUcmlhbmdsZVVWTWFwcGluZyhnZW9tZXRyeSwgMjApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGdlb21ldHJ5O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNyZWF0ZUQxMFBvbHloZWRyb25HZW9tZXRyeShzaXplOiBudW1iZXIpOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB7XHJcbiAgICAgICAgLy8gQmFzZWQgb24gcmVhY3QtM2QtZGljZSBpbXBsZW1lbnRhdGlvblxyXG4gICAgICAgIGNvbnN0IHNpZGVzID0gMTA7XHJcbiAgICAgICAgY29uc3QgdmVydGljZXM6IG51bWJlcltdID0gWzAsIDAsIDEsIDAsIDAsIC0xXTtcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIHZlcnRpY2VzIGFyb3VuZCB0aGUgbWlkZGxlXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzaWRlczsgKytpKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGFuZ2xlID0gKGkgKiBNYXRoLlBJICogMikgLyBzaWRlcztcclxuICAgICAgICAgICAgdmVydGljZXMucHVzaChcclxuICAgICAgICAgICAgICAgIC1NYXRoLmNvcyhhbmdsZSksXHJcbiAgICAgICAgICAgICAgICAtTWF0aC5zaW4oYW5nbGUpLFxyXG4gICAgICAgICAgICAgICAgMC4xMDUgKiAoaSAlIDIgPyAxIDogLTEpXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBEZWZpbmUgZmFjZXMgKHRyaWFuZ2xlcykgLSBiYXNlZCBvbiByZWFjdC0zZC1kaWNlXHJcbiAgICAgICAgY29uc3QgZmFjZXMgPSBbXHJcbiAgICAgICAgICAgIFswLCAyLCAzXSwgWzAsIDMsIDRdLCBbMCwgNCwgNV0sIFswLCA1LCA2XSwgWzAsIDYsIDddLFxyXG4gICAgICAgICAgICBbMCwgNywgOF0sIFswLCA4LCA5XSwgWzAsIDksIDEwXSwgWzAsIDEwLCAxMV0sIFswLCAxMSwgMl0sXHJcbiAgICAgICAgICAgIFsxLCAzLCAyXSwgWzEsIDQsIDNdLCBbMSwgNSwgNF0sIFsxLCA2LCA1XSwgWzEsIDcsIDZdLFxyXG4gICAgICAgICAgICBbMSwgOCwgN10sIFsxLCA5LCA4XSwgWzEsIDEwLCA5XSwgWzEsIDExLCAxMF0sIFsxLCAyLCAxMV1cclxuICAgICAgICBdO1xyXG5cclxuICAgICAgICAvLyBDcmVhdGUgVEhSRUUuanMgUG9seWhlZHJvbkdlb21ldHJ5XHJcbiAgICAgICAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuUG9seWhlZHJvbkdlb21ldHJ5KFxyXG4gICAgICAgICAgICB2ZXJ0aWNlcyxcclxuICAgICAgICAgICAgZmFjZXMuZmxhdCgpLFxyXG4gICAgICAgICAgICBzaXplLFxyXG4gICAgICAgICAgICAwICAvLyBEZXRhaWwgbGV2ZWwgMCBmb3Igc2hhcnAgZWRnZXNcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICByZXR1cm4gZ2VvbWV0cnk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhcHBseUQxMFVWTWFwcGluZyhnZW9tZXRyeTogVEhSRUUuQnVmZmVyR2VvbWV0cnkpOiB2b2lkIHtcclxuICAgICAgICAvLyBDb252ZXJ0IHRvIG5vbi1pbmRleGVkIGdlb21ldHJ5XHJcbiAgICAgICAgY29uc3Qgbm9uSW5kZXhlZEdlb21ldHJ5ID0gZ2VvbWV0cnkudG9Ob25JbmRleGVkKCk7XHJcbiAgICAgICAgZ2VvbWV0cnkuYXR0cmlidXRlcyA9IG5vbkluZGV4ZWRHZW9tZXRyeS5hdHRyaWJ1dGVzO1xyXG4gICAgICAgIGdlb21ldHJ5LmluZGV4ID0gbnVsbDtcclxuXHJcbiAgICAgICAgY29uc3QgdXZBdHRyaWJ1dGUgPSBnZW9tZXRyeS5hdHRyaWJ1dGVzLnV2O1xyXG4gICAgICAgIGNvbnN0IHV2QXJyYXkgPSB1dkF0dHJpYnV0ZS5hcnJheSBhcyBGbG9hdDMyQXJyYXk7XHJcbiAgICAgICAgY29uc3QgcG9zaXRpb25BdHRyaWJ1dGUgPSBnZW9tZXRyeS5hdHRyaWJ1dGVzLnBvc2l0aW9uO1xyXG4gICAgICAgIGNvbnN0IHBvc2l0aW9uQXJyYXkgPSBwb3NpdGlvbkF0dHJpYnV0ZS5hcnJheSBhcyBGbG9hdDMyQXJyYXk7XHJcblxyXG4gICAgICAgIGNvbnN0IHRvdGFsVHJpYW5nbGVzID0gdXZBdHRyaWJ1dGUuY291bnQgLyAzO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBEMTA6ICR7dG90YWxUcmlhbmdsZXN9IHRyaWFuZ2xlcyB0b3RhbGApO1xyXG5cclxuICAgICAgICAvLyA1eDIgZ3JpZCBmb3IgMTAgZmFjZXNcclxuICAgICAgICBjb25zdCBjb2xzID0gNTtcclxuICAgICAgICBjb25zdCByb3dzID0gMjtcclxuICAgICAgICBjb25zdCBjZWxsV2lkdGggPSAxLjAgLyBjb2xzO1xyXG4gICAgICAgIGNvbnN0IGNlbGxIZWlnaHQgPSAxLjAgLyByb3dzO1xyXG4gICAgICAgIGNvbnN0IHBhZGRpbmcgPSAwLjAyO1xyXG5cclxuICAgICAgICAvLyBHcm91cCB0cmlhbmdsZXMgYnkgZmFjZSBiYXNlZCBvbiBub3JtYWxzXHJcbiAgICAgICAgY29uc3QgZmFjZUdyb3VwcyA9IFtdO1xyXG4gICAgICAgIGNvbnN0IGZhY2VOb3JtYWxzID0gW107XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdG90YWxUcmlhbmdsZXM7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCB2ZXJ0ZXhPZmZzZXQgPSBpICogMztcclxuXHJcbiAgICAgICAgICAgIC8vIENhbGN1bGF0ZSB0cmlhbmdsZSBub3JtYWxcclxuICAgICAgICAgICAgY29uc3QgdjEgPSBuZXcgVEhSRUUuVmVjdG9yMyhcclxuICAgICAgICAgICAgICAgIHBvc2l0aW9uQXJyYXlbdmVydGV4T2Zmc2V0ICogM10sXHJcbiAgICAgICAgICAgICAgICBwb3NpdGlvbkFycmF5W3ZlcnRleE9mZnNldCAqIDMgKyAxXSxcclxuICAgICAgICAgICAgICAgIHBvc2l0aW9uQXJyYXlbdmVydGV4T2Zmc2V0ICogMyArIDJdXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIGNvbnN0IHYyID0gbmV3IFRIUkVFLlZlY3RvcjMoXHJcbiAgICAgICAgICAgICAgICBwb3NpdGlvbkFycmF5Wyh2ZXJ0ZXhPZmZzZXQgKyAxKSAqIDNdLFxyXG4gICAgICAgICAgICAgICAgcG9zaXRpb25BcnJheVsodmVydGV4T2Zmc2V0ICsgMSkgKiAzICsgMV0sXHJcbiAgICAgICAgICAgICAgICBwb3NpdGlvbkFycmF5Wyh2ZXJ0ZXhPZmZzZXQgKyAxKSAqIDMgKyAyXVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBjb25zdCB2MyA9IG5ldyBUSFJFRS5WZWN0b3IzKFxyXG4gICAgICAgICAgICAgICAgcG9zaXRpb25BcnJheVsodmVydGV4T2Zmc2V0ICsgMikgKiAzXSxcclxuICAgICAgICAgICAgICAgIHBvc2l0aW9uQXJyYXlbKHZlcnRleE9mZnNldCArIDIpICogMyArIDFdLFxyXG4gICAgICAgICAgICAgICAgcG9zaXRpb25BcnJheVsodmVydGV4T2Zmc2V0ICsgMikgKiAzICsgMl1cclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGVkZ2UxID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5zdWJWZWN0b3JzKHYyLCB2MSk7XHJcbiAgICAgICAgICAgIGNvbnN0IGVkZ2UyID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5zdWJWZWN0b3JzKHYzLCB2MSk7XHJcbiAgICAgICAgICAgIGNvbnN0IG5vcm1hbCA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuY3Jvc3NWZWN0b3JzKGVkZ2UxLCBlZGdlMikubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBGaW5kIG9yIGNyZWF0ZSBmYWNlIGdyb3VwXHJcbiAgICAgICAgICAgIGxldCBmYWNlSW5kZXggPSAtMTtcclxuICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBmYWNlTm9ybWFscy5sZW5ndGg7IGorKykge1xyXG4gICAgICAgICAgICAgICAgaWYgKGZhY2VOb3JtYWxzW2pdLmRvdChub3JtYWwpID4gMC45NSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGZhY2VJbmRleCA9IGo7XHJcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChmYWNlSW5kZXggPT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICBmYWNlSW5kZXggPSBmYWNlTm9ybWFscy5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBmYWNlTm9ybWFscy5wdXNoKG5vcm1hbC5jbG9uZSgpKTtcclxuICAgICAgICAgICAgICAgIGZhY2VHcm91cHMucHVzaChbXSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGZhY2VHcm91cHNbZmFjZUluZGV4XS5wdXNoKGkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coYEQxMDogRm91bmQgJHtmYWNlR3JvdXBzLmxlbmd0aH0gZmFjZXNgKTtcclxuXHJcbiAgICAgICAgLy8gTWFwIGVhY2ggZmFjZSBncm91cCB0byBVViBjb29yZGluYXRlc1xyXG4gICAgICAgIGZvciAobGV0IGZhY2VJbmRleCA9IDA7IGZhY2VJbmRleCA8IE1hdGgubWluKGZhY2VHcm91cHMubGVuZ3RoLCAxMCk7IGZhY2VJbmRleCsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHRyaWFuZ2xlcyA9IGZhY2VHcm91cHNbZmFjZUluZGV4XTtcclxuXHJcbiAgICAgICAgICAgIC8vLy8gQ2FsY3VsYXRlIGZhY2Ugbm9ybWFsIHRvIGRldGVybWluZSBpZiBpdCdzIHRvcCBvciBib3R0b20gaGVtaXNwaGVyZVxyXG4gICAgICAgICAgICAvL2NvbnN0IGZpcnN0VHJpYW5nbGUgPSB0cmlhbmdsZXNbMF07XHJcbiAgICAgICAgICAgIC8vY29uc3QgdmVydGV4T2Zmc2V0ID0gZmlyc3RUcmlhbmdsZSAqIDM7XHJcbiAgICAgICAgICAgIC8vY29uc3QgdjEgPSBuZXcgVEhSRUUuVmVjdG9yMyhcclxuICAgICAgICAgICAgLy8gICAgcG9zaXRpb25BcnJheVt2ZXJ0ZXhPZmZzZXQgKiAzXSxcclxuICAgICAgICAgICAgLy8gICAgcG9zaXRpb25BcnJheVt2ZXJ0ZXhPZmZzZXQgKiAzICsgMV0sXHJcbiAgICAgICAgICAgIC8vICAgIHBvc2l0aW9uQXJyYXlbdmVydGV4T2Zmc2V0ICogMyArIDJdXHJcbiAgICAgICAgICAgIC8vKTtcclxuICAgICAgICAgICAgLy9jb25zdCB2MiA9IG5ldyBUSFJFRS5WZWN0b3IzKFxyXG4gICAgICAgICAgICAvLyAgICBwb3NpdGlvbkFycmF5Wyh2ZXJ0ZXhPZmZzZXQgKyAxKSAqIDNdLFxyXG4gICAgICAgICAgICAvLyAgICBwb3NpdGlvbkFycmF5Wyh2ZXJ0ZXhPZmZzZXQgKyAxKSAqIDMgKyAxXSxcclxuICAgICAgICAgICAgLy8gICAgcG9zaXRpb25BcnJheVsodmVydGV4T2Zmc2V0ICsgMSkgKiAzICsgMl1cclxuICAgICAgICAgICAgLy8pO1xyXG4gICAgICAgICAgICAvL2NvbnN0IHYzID0gbmV3IFRIUkVFLlZlY3RvcjMoXHJcbiAgICAgICAgICAgIC8vICAgIHBvc2l0aW9uQXJyYXlbKHZlcnRleE9mZnNldCArIDIpICogM10sXHJcbiAgICAgICAgICAgIC8vICAgIHBvc2l0aW9uQXJyYXlbKHZlcnRleE9mZnNldCArIDIpICogMyArIDFdLFxyXG4gICAgICAgICAgICAvLyAgICBwb3NpdGlvbkFycmF5Wyh2ZXJ0ZXhPZmZzZXQgKyAyKSAqIDMgKyAyXVxyXG4gICAgICAgICAgICAvLyk7XHJcblxyXG4gICAgICAgICAgICAvLy8vIENhbGN1bGF0ZSBmYWNlIGNlbnRlciBhbmQgbm9ybWFsXHJcbiAgICAgICAgICAgIC8vY29uc3QgZmFjZUNlbnRlciA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuYWRkVmVjdG9ycyh2MSwgdjIpLmFkZCh2MykuZGl2aWRlU2NhbGFyKDMpO1xyXG4gICAgICAgICAgICAvL2NvbnN0IGVkZ2UxID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5zdWJWZWN0b3JzKHYyLCB2MSk7XHJcbiAgICAgICAgICAgIC8vY29uc3QgZWRnZTIgPSBuZXcgVEhSRUUuVmVjdG9yMygpLnN1YlZlY3RvcnModjMsIHYxKTtcclxuICAgICAgICAgICAgLy9jb25zdCBmYWNlTm9ybWFsID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5jcm9zc1ZlY3RvcnMoZWRnZTEsIGVkZ2UyKS5ub3JtYWxpemUoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIERldGVybWluZSBpZiB0aGlzIGlzIGEgdG9wIGZhY2UgKFkgPiAwKSBvciBib3R0b20gZmFjZSAoWSA8IDApXHJcbiAgICAgICAgICAgIC8qY29uc3QgaXNUb3BGYWNlID0gZmFjZUNlbnRlci55ID4gMDsqL1xyXG5cclxuICAgICAgICAgICAgY29uc3QgaXNUb3BGYWNlID0gZmFjZUluZGV4ID49IDEgJiYgZmFjZUluZGV4IDw9NDtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGNvbCA9IGZhY2VJbmRleCAlIGNvbHM7XHJcbiAgICAgICAgICAgIGNvbnN0IHJvdyA9IE1hdGguZmxvb3IoZmFjZUluZGV4IC8gY29scyk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBjZWxsTGVmdCA9IGNvbCAqIGNlbGxXaWR0aCArIHBhZGRpbmc7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxSaWdodCA9IChjb2wgKyAxKSAqIGNlbGxXaWR0aCAtIHBhZGRpbmc7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxUb3AgPSByb3cgKiBjZWxsSGVpZ2h0ICsgcGFkZGluZztcclxuICAgICAgICAgICAgY29uc3QgY2VsbEJvdHRvbSA9IChyb3cgKyAxKSAqIGNlbGxIZWlnaHQgLSBwYWRkaW5nO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgY2VsbENlbnRlclggPSAoY2VsbExlZnQgKyBjZWxsUmlnaHQpIC8gMjtcclxuXHJcbiAgICAgICAgICAgIC8vIERlZmluZSB0aGUgNCB2ZXJ0aWNlcyBvZiB0aGUga2l0ZSBzaGFwZSAodG9wIDgwJSwgYm90dG9tIDIwJSlcclxuICAgICAgICAgICAgY29uc3Qga2l0ZUNlbnRlciA9IGNlbGxUb3AgKyAoY2VsbEJvdHRvbSAtIGNlbGxUb3ApICogMC44OyAvLyA4MCUgZG93biBmcm9tIHRvcFxyXG4gICAgICAgICAgICBsZXQga2l0ZVZlcnRpY2VzO1xyXG5cclxuXHJcbiAgICAgICAgICAgIC8vIE1hcCB0cmlhbmdsZXMgdG8gdGhlIGtpdGVcclxuICAgICAgICAgICAgZm9yIChsZXQgdCA9IDA7IHQgPCB0cmlhbmdsZXMubGVuZ3RoOyB0KyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRyaWFuZ2xlSW5kZXggPSB0cmlhbmdsZXNbdF07XHJcbiAgICAgICAgICAgICAgICBjb25zdCB2ZXJ0ZXhPZmZzZXQgPSB0cmlhbmdsZUluZGV4ICogMztcclxuICAgICAgICAgICAgICAgIGNvbnN0IHV2SW5kZXggPSB2ZXJ0ZXhPZmZzZXQgKiAyO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChpc1RvcEZhY2UpIHtcclxuICAgICAgICAgICAgICAgICAgICBraXRlVmVydGljZXMgPSBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgeDogY2VsbENlbnRlclgsIHk6IGNlbGxUb3AgfSwgICAgICAgIC8vIFRvcCB2ZXJ0ZXggKDApXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgeDogY2VsbExlZnQsIHk6IGtpdGVDZW50ZXIgfSwgICAgICAgLy8gUmlnaHQgdmVydGV4ICgxKSAtIGF0IDgwJSBwb2ludFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB7IHg6IGNlbGxDZW50ZXJYLCB5OiBjZWxsQm90dG9tIH0sICAgICAvLyBCb3R0b20gdmVydGV4ICgyKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB7IHg6IGNlbGxSaWdodCwgeToga2l0ZUNlbnRlciB9ICAgICAgICAgLy8gTGVmdCB2ZXJ0ZXggKDMpIC0gYXQgODAlIHBvaW50XHJcbiAgICAgICAgICAgICAgICAgICAgXTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGaXJzdCB0cmlhbmdsZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB1dkFycmF5W3V2SW5kZXhdID0ga2l0ZVZlcnRpY2VzWzNdLng7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDFdID0ga2l0ZVZlcnRpY2VzWzNdLnk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDJdID0ga2l0ZVZlcnRpY2VzWzJdLng7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDNdID0ga2l0ZVZlcnRpY2VzWzJdLnk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDRdID0ga2l0ZVZlcnRpY2VzWzBdLng7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDVdID0ga2l0ZVZlcnRpY2VzWzBdLnk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0ID09PSAxKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNlY29uZCB0cmlhbmdsZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB1dkFycmF5W3V2SW5kZXhdID0ga2l0ZVZlcnRpY2VzWzJdLng7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDFdID0ga2l0ZVZlcnRpY2VzWzJdLnk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDJdID0ga2l0ZVZlcnRpY2VzWzFdLng7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDNdID0ga2l0ZVZlcnRpY2VzWzFdLnk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDRdID0ga2l0ZVZlcnRpY2VzWzBdLng7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDVdID0ga2l0ZVZlcnRpY2VzWzBdLnk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICBraXRlVmVydGljZXMgPSBbXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgeDogY2VsbENlbnRlclgsIHk6IGNlbGxCb3R0b20gfSwgICAgICAgIC8vIFRvcCB2ZXJ0ZXggKDApXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHsgeDogY2VsbFJpZ2h0LCB5OiBraXRlQ2VudGVyIH0sICAgICAgIC8vIFJpZ2h0IHZlcnRleCAoMSkgLSBhdCA4MCUgcG9pbnRcclxuICAgICAgICAgICAgICAgICAgICAgICAgeyB4OiBjZWxsQ2VudGVyWCwgeTogY2VsbFRvcCB9LCAgICAgLy8gQm90dG9tIHZlcnRleCAoMilcclxuICAgICAgICAgICAgICAgICAgICAgICAgeyB4OiBjZWxsTGVmdCwgeToga2l0ZUNlbnRlciB9ICAgICAgICAgLy8gTGVmdCB2ZXJ0ZXggKDMpIC0gYXQgODAlIHBvaW50XHJcbiAgICAgICAgICAgICAgICAgICAgXTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAodCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBGaXJzdCB0cmlhbmdsZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB1dkFycmF5W3V2SW5kZXhdID0ga2l0ZVZlcnRpY2VzWzBdLng7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDFdID0ga2l0ZVZlcnRpY2VzWzBdLnk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDJdID0ga2l0ZVZlcnRpY2VzWzNdLng7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDNdID0ga2l0ZVZlcnRpY2VzWzNdLnk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDRdID0ga2l0ZVZlcnRpY2VzWzJdLng7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDVdID0ga2l0ZVZlcnRpY2VzWzJdLnk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0ID09PSAxKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNlY29uZCB0cmlhbmdsZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB1dkFycmF5W3V2SW5kZXhdID0ga2l0ZVZlcnRpY2VzWzFdLng7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDFdID0ga2l0ZVZlcnRpY2VzWzFdLnk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDJdID0ga2l0ZVZlcnRpY2VzWzBdLng7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDNdID0ga2l0ZVZlcnRpY2VzWzBdLnk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDRdID0ga2l0ZVZlcnRpY2VzWzJdLng7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDVdID0ga2l0ZVZlcnRpY2VzWzJdLnk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB1dkF0dHJpYnV0ZS5uZWVkc1VwZGF0ZSA9IHRydWU7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ0FwcGxpZWQgRDEwIFVWIG1hcHBpbmcgd2l0aCBwcm9wZXIga2l0ZSBmYWNlcycpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY3JlYXRlUGVudGFnb25hbFRyYXBlem9oZWRyb25HZW9tZXRyeShzaXplOiBudW1iZXIpOiBUSFJFRS5CdWZmZXJHZW9tZXRyeSB7XHJcbiAgICAgICAgY29uc3QgZ2VvbWV0cnkgPSBuZXcgVEhSRUUuQnVmZmVyR2VvbWV0cnkoKTtcclxuICAgICAgICBjb25zdCB0b3BIZWlnaHQgPSBzaXplICogMC43NTtcclxuICAgICAgICBjb25zdCBib3R0b21IZWlnaHQgPSAtdG9wSGVpZ2h0O1xyXG4gICAgICAgIGNvbnN0IHJpbmdSYWRpdXMgPSBzaXplICogMC45O1xyXG5cclxuICAgICAgICBjb25zdCB0b3BWZXJ0aWNlczogVEhSRUUuVmVjdG9yM1tdID0gW107XHJcbiAgICAgICAgY29uc3QgYm90dG9tVmVydGljZXM6IFRIUkVFLlZlY3RvcjNbXSA9IFtdO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDU7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBhbmdsZSA9IChpICogTWF0aC5QSSAqIDIpIC8gNTtcclxuICAgICAgICAgICAgdG9wVmVydGljZXMucHVzaChuZXcgVEhSRUUuVmVjdG9yMyhNYXRoLmNvcyhhbmdsZSkgKiByaW5nUmFkaXVzLCB0b3BIZWlnaHQsIE1hdGguc2luKGFuZ2xlKSAqIHJpbmdSYWRpdXMpKTtcclxuICAgICAgICAgICAgY29uc3QgYm90dG9tQW5nbGUgPSBhbmdsZSArIE1hdGguUEkgLyA1O1xyXG4gICAgICAgICAgICBib3R0b21WZXJ0aWNlcy5wdXNoKG5ldyBUSFJFRS5WZWN0b3IzKE1hdGguY29zKGJvdHRvbUFuZ2xlKSAqIHJpbmdSYWRpdXMsIGJvdHRvbUhlaWdodCwgTWF0aC5zaW4oYm90dG9tQW5nbGUpICogcmluZ1JhZGl1cykpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgcG9zaXRpb25zOiBudW1iZXJbXSA9IFtdO1xyXG4gICAgICAgIGNvbnN0IHV2czogbnVtYmVyW10gPSBbXTtcclxuXHJcbiAgICAgICAgY29uc3QgYWRkVHJpYW5nbGUgPSAodjE6IFRIUkVFLlZlY3RvcjMsIHV2MTogW251bWJlciwgbnVtYmVyXSwgdjI6IFRIUkVFLlZlY3RvcjMsIHV2MjogW251bWJlciwgbnVtYmVyXSwgdjM6IFRIUkVFLlZlY3RvcjMsIHV2MzogW251bWJlciwgbnVtYmVyXSkgPT4ge1xyXG4gICAgICAgICAgICBwb3NpdGlvbnMucHVzaCh2MS54LCB2MS55LCB2MS56LCB2Mi54LCB2Mi55LCB2Mi56LCB2My54LCB2My55LCB2My56KTtcclxuICAgICAgICAgICAgdXZzLnB1c2godXYxWzBdLCB1djFbMV0sIHV2MlswXSwgdXYyWzFdLCB1djNbMF0sIHV2M1sxXSk7XHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgY29uc3QgY29scyA9IDU7XHJcbiAgICAgICAgY29uc3Qgcm93cyA9IDI7XHJcbiAgICAgICAgY29uc3QgY2VsbFdpZHRoID0gMSAvIGNvbHM7XHJcbiAgICAgICAgY29uc3QgY2VsbEhlaWdodCA9IDEgLyByb3dzO1xyXG4gICAgICAgIGNvbnN0IHBhZGRpbmcgPSAwLjAyO1xyXG5cclxuICAgICAgICBjb25zdCBnZXRDZWxsID0gKGZhY2VJbmRleDogbnVtYmVyKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbCA9IGZhY2VJbmRleCAlIGNvbHM7XHJcbiAgICAgICAgICAgIGNvbnN0IHJvdyA9IE1hdGguZmxvb3IoZmFjZUluZGV4IC8gY29scyk7XHJcbiAgICAgICAgICAgIGNvbnN0IGxlZnQgPSBjb2wgKiBjZWxsV2lkdGggKyBwYWRkaW5nO1xyXG4gICAgICAgICAgICBjb25zdCByaWdodCA9IChjb2wgKyAxKSAqIGNlbGxXaWR0aCAtIHBhZGRpbmc7XHJcbiAgICAgICAgICAgIGNvbnN0IHRvcCA9IHJvdyAqIGNlbGxIZWlnaHQgKyBwYWRkaW5nO1xyXG4gICAgICAgICAgICBjb25zdCBib3R0b20gPSAocm93ICsgMSkgKiBjZWxsSGVpZ2h0IC0gcGFkZGluZztcclxuICAgICAgICAgICAgY29uc3QgY2VudGVyID0gKGxlZnQgKyByaWdodCkgLyAyO1xyXG4gICAgICAgICAgICByZXR1cm4geyBsZWZ0LCByaWdodCwgdG9wLCBib3R0b20sIGNlbnRlciB9O1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIFVwcGVyIHJpbmcgZmFjZXMgKDAtNClcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IDU7IGkrKykge1xyXG4gICAgICAgICAgICBjb25zdCBuZXh0ID0gKGkgKyAxKSAlIDU7XHJcbiAgICAgICAgICAgIGNvbnN0IHsgbGVmdCwgcmlnaHQsIHRvcCwgYm90dG9tLCBjZW50ZXIgfSA9IGdldENlbGwoaSk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0MCA9IHRvcFZlcnRpY2VzW2ldO1xyXG4gICAgICAgICAgICBjb25zdCBiMCA9IGJvdHRvbVZlcnRpY2VzW2ldO1xyXG4gICAgICAgICAgICBjb25zdCB0MSA9IHRvcFZlcnRpY2VzW25leHRdO1xyXG4gICAgICAgICAgICBjb25zdCBiMSA9IGJvdHRvbVZlcnRpY2VzW25leHRdO1xyXG5cclxuICAgICAgICAgICAgYWRkVHJpYW5nbGUodDAsIFtjZW50ZXIsIHRvcF0sIGIwLCBbbGVmdCwgYm90dG9tXSwgdDEsIFtyaWdodCwgdG9wXSk7XHJcbiAgICAgICAgICAgIGFkZFRyaWFuZ2xlKHQxLCBbcmlnaHQsIHRvcF0sIGIwLCBbbGVmdCwgYm90dG9tXSwgYjEsIFtyaWdodCwgYm90dG9tXSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBMb3dlciByaW5nIGZhY2VzICg1LTkpXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1OyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgcHJldiA9IChpIC0gMSArIDUpICUgNTtcclxuICAgICAgICAgICAgY29uc3QgeyBsZWZ0LCByaWdodCwgdG9wLCBib3R0b20sIGNlbnRlciB9ID0gZ2V0Q2VsbChpICsgNSk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0MCA9IHRvcFZlcnRpY2VzW2ldO1xyXG4gICAgICAgICAgICBjb25zdCBiUHJldiA9IGJvdHRvbVZlcnRpY2VzW3ByZXZdO1xyXG4gICAgICAgICAgICBjb25zdCB0UHJldiA9IHRvcFZlcnRpY2VzW3ByZXZdO1xyXG4gICAgICAgICAgICBjb25zdCBiMCA9IGJvdHRvbVZlcnRpY2VzW2ldO1xyXG5cclxuICAgICAgICAgICAgYWRkVHJpYW5nbGUodDAsIFtjZW50ZXIsIHRvcF0sIGJQcmV2LCBbcmlnaHQsIGJvdHRvbV0sIHRQcmV2LCBbcmlnaHQsIHRvcF0pO1xyXG4gICAgICAgICAgICBhZGRUcmlhbmdsZSh0MCwgW2NlbnRlciwgdG9wXSwgYjAsIFtsZWZ0LCBib3R0b21dLCBiUHJldiwgW3JpZ2h0LCBib3R0b21dKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGdlb21ldHJ5LnNldEF0dHJpYnV0ZSgncG9zaXRpb24nLCBuZXcgVEhSRUUuRmxvYXQzMkJ1ZmZlckF0dHJpYnV0ZShwb3NpdGlvbnMsIDMpKTtcclxuICAgICAgICBnZW9tZXRyeS5zZXRBdHRyaWJ1dGUoJ3V2JywgbmV3IFRIUkVFLkZsb2F0MzJCdWZmZXJBdHRyaWJ1dGUodXZzLCAyKSk7XHJcbiAgICAgICAgZ2VvbWV0cnkuY29tcHV0ZVZlcnRleE5vcm1hbHMoKTtcclxuICAgICAgICByZXR1cm4gZ2VvbWV0cnk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhcHBseVRyaWFuZ2xlVVZNYXBwaW5nKGdlb21ldHJ5OiBUSFJFRS5CdWZmZXJHZW9tZXRyeSwgZmFjZUNvdW50OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICAvLyBDb252ZXJ0IHRvIG5vbi1pbmRleGVkIGdlb21ldHJ5IHNvIGVhY2ggZmFjZSBoYXMgaXRzIG93biB2ZXJ0aWNlc1xyXG4gICAgICAgIGNvbnN0IG5vbkluZGV4ZWRHZW9tZXRyeSA9IGdlb21ldHJ5LnRvTm9uSW5kZXhlZCgpO1xyXG4gICAgICAgIGdlb21ldHJ5LmF0dHJpYnV0ZXMgPSBub25JbmRleGVkR2VvbWV0cnkuYXR0cmlidXRlcztcclxuICAgICAgICBnZW9tZXRyeS5pbmRleCA9IG51bGw7XHJcblxyXG4gICAgICAgIGNvbnN0IHV2QXR0cmlidXRlID0gZ2VvbWV0cnkuYXR0cmlidXRlcy51djtcclxuICAgICAgICBjb25zdCB1dkFycmF5ID0gdXZBdHRyaWJ1dGUuYXJyYXkgYXMgRmxvYXQzMkFycmF5O1xyXG5cclxuICAgICAgICAvLyBEZWZpbmUgVVYgbGF5b3V0IGluIGEgZ3JpZCB0aGF0IG1hdGNoZXMgdGhlIHRlbXBsYXRlIGdlbmVyYXRpb25cclxuICAgICAgICBsZXQgY29scywgcm93cztcclxuICAgICAgICBpZiAoZmFjZUNvdW50ID09PSA0KSB7XHJcbiAgICAgICAgICAgIC8vIEQ0OiAyeDIgZ3JpZCB0byBtYXRjaCB0ZW1wbGF0ZVxyXG4gICAgICAgICAgICBjb2xzID0gMjtcclxuICAgICAgICAgICAgcm93cyA9IDI7XHJcbiAgICAgICAgfSBlbHNlIGlmIChmYWNlQ291bnQgPT09IDgpIHtcclxuICAgICAgICAgICAgLy8gRDg6IDN4MyBncmlkIHRvIG1hdGNoIHRlbXBsYXRlXHJcbiAgICAgICAgICAgIGNvbHMgPSAzO1xyXG4gICAgICAgICAgICByb3dzID0gMztcclxuICAgICAgICB9IGVsc2UgaWYgKGZhY2VDb3VudCA9PT0gMTIpIHtcclxuICAgICAgICAgICAgLy8gRDEyOiA0eDMgZ3JpZCB0byBtYXRjaCB0ZW1wbGF0ZVxyXG4gICAgICAgICAgICBjb2xzID0gNDtcclxuICAgICAgICAgICAgcm93cyA9IDM7XHJcbiAgICAgICAgfSBlbHNlIGlmIChmYWNlQ291bnQgPT09IDIwKSB7XHJcbiAgICAgICAgICAgIC8vIEQyMDogNXg0IGdyaWQgdG8gbWF0Y2ggdGVtcGxhdGVcclxuICAgICAgICAgICAgY29scyA9IDU7XHJcbiAgICAgICAgICAgIHJvd3MgPSA0O1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIEZhbGxiYWNrOiBzcXVhcmUtaXNoIGdyaWRcclxuICAgICAgICAgICAgY29scyA9IE1hdGguY2VpbChNYXRoLnNxcnQoZmFjZUNvdW50KSk7XHJcbiAgICAgICAgICAgIHJvd3MgPSBNYXRoLmNlaWwoZmFjZUNvdW50IC8gY29scyk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zb2xlLmxvZyhgQXBwbHlpbmcgdHJpYW5nbGUgVVYgbWFwcGluZyBmb3IgJHtmYWNlQ291bnR9IGZhY2VzIHVzaW5nICR7Y29sc314JHtyb3dzfSBncmlkYCk7XHJcbiAgICAgICAgY29uc3QgY2VsbFdpZHRoID0gMS4wIC8gY29scztcclxuICAgICAgICBjb25zdCBjZWxsSGVpZ2h0ID0gMS4wIC8gcm93cztcclxuICAgICAgICBjb25zdCBwYWRkaW5nID0gMC4wMjsgLy8gU21hbGwgcGFkZGluZyBiZXR3ZWVuIHRyaWFuZ2xlc1xyXG5cclxuICAgICAgICBmb3IgKGxldCBmYWNlSW5kZXggPSAwOyBmYWNlSW5kZXggPCBmYWNlQ291bnQ7IGZhY2VJbmRleCsrKSB7XHJcbiAgICAgICAgICAgIC8vIENhbGN1bGF0ZSBncmlkIHBvc2l0aW9uXHJcbiAgICAgICAgICAgIGNvbnN0IGNvbCA9IGZhY2VJbmRleCAlIGNvbHM7XHJcbiAgICAgICAgICAgIGNvbnN0IHJvdyA9IE1hdGguZmxvb3IoZmFjZUluZGV4IC8gY29scyk7XHJcblxyXG4gICAgICAgICAgICAvLyBDYWxjdWxhdGUgY2VsbCBib3VuZHMgd2l0aCBwYWRkaW5nXHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxMZWZ0ID0gY29sICogY2VsbFdpZHRoICsgcGFkZGluZztcclxuICAgICAgICAgICAgY29uc3QgY2VsbFJpZ2h0ID0gKGNvbCArIDEpICogY2VsbFdpZHRoIC0gcGFkZGluZztcclxuICAgICAgICAgICAgY29uc3QgY2VsbFRvcCA9IHJvdyAqIGNlbGxIZWlnaHQgKyBwYWRkaW5nO1xyXG4gICAgICAgICAgICBjb25zdCBjZWxsQm90dG9tID0gKHJvdyArIDEpICogY2VsbEhlaWdodCAtIHBhZGRpbmc7XHJcblxyXG4gICAgICAgICAgICAvLyBDYWxjdWxhdGUgY2VsbCBjZW50ZXIgYW5kIHNpemVcclxuICAgICAgICAgICAgY29uc3QgY2VsbENlbnRlclggPSAoY2VsbExlZnQgKyBjZWxsUmlnaHQpIC8gMjtcclxuICAgICAgICAgICAgY29uc3QgY2VsbENlbnRlclkgPSAoY2VsbFRvcCArIGNlbGxCb3R0b20pIC8gMjtcclxuICAgICAgICAgICAgY29uc3QgY2VsbFcgPSBjZWxsUmlnaHQgLSBjZWxsTGVmdDtcclxuICAgICAgICAgICAgY29uc3QgY2VsbEggPSBjZWxsQm90dG9tIC0gY2VsbFRvcDtcclxuXHJcbiAgICAgICAgICAgIC8vIENyZWF0ZSBlcXVpbGF0ZXJhbCB0cmlhbmdsZSB0aGF0IGZpdHMgd2l0aGluIHRoZSBjZWxsXHJcbiAgICAgICAgICAgIGNvbnN0IHRyaWFuZ2xlSGVpZ2h0ID0gTWF0aC5taW4oY2VsbEgsIGNlbGxXICogTWF0aC5zcXJ0KDMpIC8gMik7XHJcbiAgICAgICAgICAgIGNvbnN0IHRyaWFuZ2xlV2lkdGggPSB0cmlhbmdsZUhlaWdodCAqIDIgLyBNYXRoLnNxcnQoMyk7XHJcblxyXG4gICAgICAgICAgICAvLyBBbGwgdHJpYW5nbGVzIHBvaW50IHVwIGZvciBjb25zaXN0ZW5jeVxyXG4gICAgICAgICAgICBjb25zdCB2MSA9IHtcclxuICAgICAgICAgICAgICAgIHg6IGNlbGxDZW50ZXJYLFxyXG4gICAgICAgICAgICAgICAgeTogY2VsbFRvcFxyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgY29uc3QgdjIgPSB7XHJcbiAgICAgICAgICAgICAgICB4OiBjZWxsQ2VudGVyWCAtIHRyaWFuZ2xlV2lkdGggLyAyLFxyXG4gICAgICAgICAgICAgICAgeTogY2VsbFRvcCArIHRyaWFuZ2xlSGVpZ2h0XHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICBjb25zdCB2MyA9IHtcclxuICAgICAgICAgICAgICAgIHg6IGNlbGxDZW50ZXJYICsgdHJpYW5nbGVXaWR0aCAvIDIsXHJcbiAgICAgICAgICAgICAgICB5OiBjZWxsVG9wICsgdHJpYW5nbGVIZWlnaHRcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgICAgIC8vIEVuc3VyZSB0cmlhbmdsZXMgZG9uJ3QgZXhjZWVkIGNlbGwgYm91bmRhcmllc1xyXG4gICAgICAgICAgICBjb25zdCB2ZXJ0aWNlcyA9IFt2MSwgdjIsIHYzXTtcclxuICAgICAgICAgICAgdmVydGljZXMuZm9yRWFjaCh2ID0+IHtcclxuICAgICAgICAgICAgICAgIHYueCA9IE1hdGgubWF4KGNlbGxMZWZ0LCBNYXRoLm1pbihjZWxsUmlnaHQsIHYueCkpO1xyXG4gICAgICAgICAgICAgICAgdi55ID0gTWF0aC5tYXgoY2VsbFRvcCwgTWF0aC5taW4oY2VsbEJvdHRvbSwgdi55KSk7XHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gU2V0IFVWIGNvb3JkaW5hdGVzIGZvciB0aGUgdGhyZWUgdmVydGljZXMgb2YgdGhpcyBmYWNlXHJcbiAgICAgICAgICAgIGNvbnN0IHZlcnRleE9mZnNldCA9IGZhY2VJbmRleCAqIDM7XHJcblxyXG4gICAgICAgICAgICAvLyBGaXJzdCB2ZXJ0ZXggVVZzIChSRVNUT1JFIEQyMCBZLUZMSVApXHJcbiAgICAgICAgICAgIHV2QXJyYXlbKHZlcnRleE9mZnNldCAqIDIpXSA9IHYxLng7XHJcbiAgICAgICAgICAgIHV2QXJyYXlbKHZlcnRleE9mZnNldCAqIDIpICsgMV0gPSAxLjAgLSB2MS55O1xyXG5cclxuICAgICAgICAgICAgLy8gU2Vjb25kIHZlcnRleCBVVnMgKFJFU1RPUkUgRDIwIFktRkxJUClcclxuICAgICAgICAgICAgdXZBcnJheVsodmVydGV4T2Zmc2V0ICogMikgKyAyXSA9IHYyLng7XHJcbiAgICAgICAgICAgIHV2QXJyYXlbKHZlcnRleE9mZnNldCAqIDIpICsgM10gPSAxLjAgLSB2Mi55O1xyXG5cclxuICAgICAgICAgICAgLy8gVGhpcmQgdmVydGV4IFVWcyAoUkVTVE9SRSBEMjAgWS1GTElQKVxyXG4gICAgICAgICAgICB1dkFycmF5Wyh2ZXJ0ZXhPZmZzZXQgKiAyKSArIDRdID0gdjMueDtcclxuICAgICAgICAgICAgdXZBcnJheVsodmVydGV4T2Zmc2V0ICogMikgKyA1XSA9IDEuMCAtIHYzLnk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBNYXJrIFVWIGF0dHJpYnV0ZSBhcyBuZWVkaW5nIHVwZGF0ZVxyXG4gICAgICAgIHV2QXR0cmlidXRlLm5lZWRzVXBkYXRlID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coYEFwcGxpZWQgdHJpYW5nbGUgVVYgbWFwcGluZyB3aXRoIGVxdWlsYXRlcmFsIHRyaWFuZ2xlcyBmb3IgJHtmYWNlQ291bnR9IGZhY2VzYCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhcHBseVRldHJhaGVkcm9uVVZNYXBwaW5nKGdlb21ldHJ5OiBUSFJFRS5CdWZmZXJHZW9tZXRyeSk6IHZvaWQge1xyXG4gICAgICAgIC8vIENvbnZlcnQgdG8gbm9uLWluZGV4ZWQgZ2VvbWV0cnkgZm9yIHByb3BlciBVViBtYXBwaW5nXHJcbiAgICAgICAgY29uc3Qgbm9uSW5kZXhlZEdlb21ldHJ5ID0gZ2VvbWV0cnkudG9Ob25JbmRleGVkKCk7XHJcbiAgICAgICAgZ2VvbWV0cnkuYXR0cmlidXRlcyA9IG5vbkluZGV4ZWRHZW9tZXRyeS5hdHRyaWJ1dGVzO1xyXG4gICAgICAgIGdlb21ldHJ5LmluZGV4ID0gbnVsbDtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coJ0FwcGx5aW5nIHRldHJhaGVkcm9uIFVWIG1hcHBpbmcgZm9yIEQ0Jyk7XHJcblxyXG4gICAgICAgIGNvbnN0IHV2QXR0cmlidXRlID0gZ2VvbWV0cnkuYXR0cmlidXRlcy51djtcclxuICAgICAgICBjb25zdCB1dkFycmF5ID0gdXZBdHRyaWJ1dGUuYXJyYXkgYXMgRmxvYXQzMkFycmF5O1xyXG5cclxuICAgICAgICAvLyBENCBoYXMgZXhhY3RseSA0IHRyaWFuZ3VsYXIgZmFjZXMgaW4gYSAyeDIgZ3JpZFxyXG4gICAgICAgIGNvbnN0IGNvbHMgPSAyO1xyXG4gICAgICAgIGNvbnN0IHJvd3MgPSAyO1xyXG4gICAgICAgIGNvbnN0IGNlbGxXaWR0aCA9IDEuMCAvIGNvbHM7XHJcbiAgICAgICAgY29uc3QgY2VsbEhlaWdodCA9IDEuMCAvIHJvd3M7XHJcblxyXG4gICAgICAgIC8vIFRldHJhaGVkcm9uR2VvbWV0cnkgaGFzIDQgdHJpYW5ndWxhciBmYWNlc1xyXG4gICAgICAgIGZvciAobGV0IGZhY2VJbmRleCA9IDA7IGZhY2VJbmRleCA8IDQ7IGZhY2VJbmRleCsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbCA9IGZhY2VJbmRleCAlIGNvbHM7XHJcbiAgICAgICAgICAgIGNvbnN0IHJvdyA9IE1hdGguZmxvb3IoZmFjZUluZGV4IC8gY29scyk7XHJcblxyXG4gICAgICAgICAgICAvLyBFcXVpbGF0ZXJhbCB0cmlhbmdsZXMgdGhhdCB1c2UgZnVsbCBncmlkIGNlbGwgd2lkdGhcclxuICAgICAgICAgICAgY29uc3QgY2VsbExlZnQgPSBjb2wgKiBjZWxsV2lkdGg7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxSaWdodCA9IChjb2wgKyAxKSAqIGNlbGxXaWR0aDtcclxuICAgICAgICAgICAgY29uc3QgY2VsbFRvcCA9IHJvdyAqIGNlbGxIZWlnaHQ7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxCb3R0b20gPSAocm93ICsgMSkgKiBjZWxsSGVpZ2h0O1xyXG5cclxuICAgICAgICAgICAgY29uc3QgY2VsbENlbnRlclggPSAoY2VsbExlZnQgKyBjZWxsUmlnaHQpIC8gMjtcclxuICAgICAgICAgICAgY29uc3QgY2VsbENlbnRlclkgPSAoY2VsbFRvcCArIGNlbGxCb3R0b20pIC8gMjtcclxuXHJcbiAgICAgICAgICAgIC8vIEVxdWlsYXRlcmFsIHRyaWFuZ2xlIHdpdGggYmFzZSA9IGZ1bGwgY2VsbCB3aWR0aFxyXG4gICAgICAgICAgICBjb25zdCB0cmlhbmdsZUJhc2UgPSBjZWxsV2lkdGg7XHJcbiAgICAgICAgICAgIGNvbnN0IHRyaWFuZ2xlSGVpZ2h0ID0gdHJpYW5nbGVCYXNlICogTWF0aC5zcXJ0KDMpIC8gMjsgLy8gSGVpZ2h0IG9mIGVxdWlsYXRlcmFsIHRyaWFuZ2xlXHJcblxyXG4gICAgICAgICAgICAvLyBDZW50ZXIgdGhlIHRyaWFuZ2xlIHZlcnRpY2FsbHkgaW4gdGhlIGNlbGxcclxuICAgICAgICAgICAgY29uc3QgdG9wWCA9IGNlbGxDZW50ZXJYO1xyXG4gICAgICAgICAgICBjb25zdCB0b3BZID0gY2VsbENlbnRlclkgLSB0cmlhbmdsZUhlaWdodCAvIDI7XHJcbiAgICAgICAgICAgIGNvbnN0IGxlZnRYID0gY2VsbExlZnQ7XHJcbiAgICAgICAgICAgIGNvbnN0IGxlZnRZID0gY2VsbENlbnRlclkgKyB0cmlhbmdsZUhlaWdodCAvIDI7XHJcbiAgICAgICAgICAgIGNvbnN0IHJpZ2h0WCA9IGNlbGxSaWdodDtcclxuICAgICAgICAgICAgY29uc3QgcmlnaHRZID0gY2VsbENlbnRlclkgKyB0cmlhbmdsZUhlaWdodCAvIDI7XHJcblxyXG4gICAgICAgICAgICAvLyBTZXQgVVYgY29vcmRpbmF0ZXMgZm9yIHRoZSB0aHJlZSB2ZXJ0aWNlcyBvZiB0aGlzIGZhY2VcclxuICAgICAgICAgICAgY29uc3QgdmVydGV4T2Zmc2V0ID0gZmFjZUluZGV4ICogMztcclxuXHJcbiAgICAgICAgICAgIC8vIEZpcnN0IHZlcnRleCBVVnMgKHRvcCB2ZXJ0ZXgpXHJcbiAgICAgICAgICAgIHV2QXJyYXlbKHZlcnRleE9mZnNldCAqIDIpXSA9IHRvcFg7XHJcbiAgICAgICAgICAgIHV2QXJyYXlbKHZlcnRleE9mZnNldCAqIDIpICsgMV0gPSB0b3BZO1xyXG5cclxuICAgICAgICAgICAgLy8gU2Vjb25kIHZlcnRleCBVVnMgKGxlZnQgdmVydGV4KVxyXG4gICAgICAgICAgICB1dkFycmF5Wyh2ZXJ0ZXhPZmZzZXQgKiAyKSArIDJdID0gbGVmdFg7XHJcbiAgICAgICAgICAgIHV2QXJyYXlbKHZlcnRleE9mZnNldCAqIDIpICsgM10gPSBsZWZ0WTtcclxuXHJcbiAgICAgICAgICAgIC8vIFRoaXJkIHZlcnRleCBVVnMgKHJpZ2h0IHZlcnRleClcclxuICAgICAgICAgICAgdXZBcnJheVsodmVydGV4T2Zmc2V0ICogMikgKyA0XSA9IHJpZ2h0WDtcclxuICAgICAgICAgICAgdXZBcnJheVsodmVydGV4T2Zmc2V0ICogMikgKyA1XSA9IHJpZ2h0WTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHV2QXR0cmlidXRlLm5lZWRzVXBkYXRlID0gdHJ1ZTtcclxuICAgICAgICBjb25zb2xlLmxvZygnQXBwbGllZCBzaW1wbGUgdGV0cmFoZWRyb24gVVYgbWFwcGluZyBmb3IgRDQgd2l0aCBmdWxsIGdyaWQgY2VsbHMnKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFwcGx5U3F1YXJlVVZNYXBwaW5nKGdlb21ldHJ5OiBUSFJFRS5CdWZmZXJHZW9tZXRyeSk6IHZvaWQge1xyXG4gICAgICAgIC8vIEJveEdlb21ldHJ5IGhhcyA2IGZhY2VzLCBlYWNoIHdpdGggMiB0cmlhbmdsZXMgKDEyIHRyaWFuZ2xlcyB0b3RhbClcclxuICAgICAgICBjb25zdCB1dkF0dHJpYnV0ZSA9IGdlb21ldHJ5LmF0dHJpYnV0ZXMudXY7XHJcbiAgICAgICAgY29uc3QgdXZBcnJheSA9IHV2QXR0cmlidXRlLmFycmF5IGFzIEZsb2F0MzJBcnJheTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coJ0FwcGx5aW5nIHNxdWFyZSBVViBtYXBwaW5nIGZvciBENicpO1xyXG5cclxuICAgICAgICAvLyBEZWZpbmUgVVYgbGF5b3V0IGluIGEgM3gyIGdyaWQgZm9yIDYgZmFjZXMgdG8gbWF0Y2ggdGVtcGxhdGVcclxuICAgICAgICBjb25zdCBjb2xzID0gMztcclxuICAgICAgICBjb25zdCByb3dzID0gMjtcclxuICAgICAgICBjb25zdCBjZWxsV2lkdGggPSAxLjAgLyBjb2xzO1xyXG4gICAgICAgIGNvbnN0IGNlbGxIZWlnaHQgPSAxLjAgLyByb3dzO1xyXG4gICAgICAgIGNvbnN0IHBhZGRpbmcgPSAwLjAyO1xyXG5cclxuICAgICAgICAvLyBCb3hHZW9tZXRyeSBmYWNlIG9yZGVyOiByaWdodCwgbGVmdCwgdG9wLCBib3R0b20sIGZyb250LCBiYWNrXHJcbiAgICAgICAgLy8gVGVtcGxhdGUgZ3JpZCBsYXlvdXQ6XHJcbiAgICAgICAgLy8gUm93IDA6IFswLXJpZ2h0LCAxLWxlZnQsIDItdG9wXVxyXG4gICAgICAgIC8vIFJvdyAxOiBbMy1ib3R0b20sIDQtZnJvbnQsIDUtYmFja11cclxuXHJcbiAgICAgICAgZm9yIChsZXQgZmFjZUluZGV4ID0gMDsgZmFjZUluZGV4IDwgNjsgZmFjZUluZGV4KyspIHtcclxuICAgICAgICAgICAgY29uc3QgY29sID0gZmFjZUluZGV4ICUgY29scztcclxuICAgICAgICAgICAgY29uc3Qgcm93ID0gTWF0aC5mbG9vcihmYWNlSW5kZXggLyBjb2xzKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxMZWZ0ID0gY29sICogY2VsbFdpZHRoICsgcGFkZGluZztcclxuICAgICAgICAgICAgY29uc3QgY2VsbFJpZ2h0ID0gKGNvbCArIDEpICogY2VsbFdpZHRoIC0gcGFkZGluZztcclxuICAgICAgICAgICAgY29uc3QgY2VsbFRvcCA9IHJvdyAqIGNlbGxIZWlnaHQgKyBwYWRkaW5nO1xyXG4gICAgICAgICAgICBjb25zdCBjZWxsQm90dG9tID0gKHJvdyArIDEpICogY2VsbEhlaWdodCAtIHBhZGRpbmc7XHJcblxyXG4gICAgICAgICAgICAvLyBFYWNoIGZhY2UgaGFzIDIgdHJpYW5nbGVzIHdpdGggMyB2ZXJ0aWNlcyBlYWNoID0gNiB2ZXJ0aWNlc1xyXG4gICAgICAgICAgICAvLyBCb3hHZW9tZXRyeSB1c2VzIDQgdW5pcXVlIHZlcnRpY2VzIHBlciBmYWNlIHdpdGggc2hhcmVkIHZlcnRpY2VzIGZvciB0cmlhbmdsZXNcclxuICAgICAgICAgICAgY29uc3QgZmFjZVZlcnRleFN0YXJ0ID0gZmFjZUluZGV4ICogNDtcclxuXHJcbiAgICAgICAgICAgIC8vIEZvciBlYWNoIGZhY2UsIHNldCBVViBjb29yZGluYXRlcyBmb3IgdGhlIDQgdmVydGljZXNcclxuICAgICAgICAgICAgLy8gRml4IG1pcnJvcmluZyBieSB1c2luZyBjb3JyZWN0IG9yaWVudGF0aW9uXHJcbiAgICAgICAgICAgIGNvbnN0IHV2Q29vcmRzID0gW1xyXG4gICAgICAgICAgICAgICAgW2NlbGxMZWZ0LCBjZWxsQm90dG9tXSwgICAgIC8vIEJvdHRvbS1sZWZ0XHJcbiAgICAgICAgICAgICAgICBbY2VsbFJpZ2h0LCBjZWxsQm90dG9tXSwgICAgLy8gQm90dG9tLXJpZ2h0XHJcbiAgICAgICAgICAgICAgICBbY2VsbExlZnQsIGNlbGxUb3BdLCAgICAgICAgLy8gVG9wLWxlZnRcclxuICAgICAgICAgICAgICAgIFtjZWxsUmlnaHQsIGNlbGxUb3BdICAgICAgICAvLyBUb3AtcmlnaHRcclxuICAgICAgICAgICAgXTtcclxuXHJcbiAgICAgICAgICAgIC8vIEFwcGx5IFVWIGNvb3JkaW5hdGVzIHRvIGVhY2ggdmVydGV4IG9mIHRoaXMgZmFjZVxyXG4gICAgICAgICAgICBmb3IgKGxldCB2ZXJ0ZXhJbmRleCA9IDA7IHZlcnRleEluZGV4IDwgNDsgdmVydGV4SW5kZXgrKykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdXZJbmRleCA9IChmYWNlVmVydGV4U3RhcnQgKyB2ZXJ0ZXhJbmRleCkgKiAyO1xyXG4gICAgICAgICAgICAgICAgdXZBcnJheVt1dkluZGV4XSA9IHV2Q29vcmRzW3ZlcnRleEluZGV4XVswXTsgICAgIC8vIFUgY29vcmRpbmF0ZVxyXG4gICAgICAgICAgICAgICAgdXZBcnJheVt1dkluZGV4ICsgMV0gPSB1dkNvb3Jkc1t2ZXJ0ZXhJbmRleF1bMV07IC8vIFYgY29vcmRpbmF0ZVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB1dkF0dHJpYnV0ZS5uZWVkc1VwZGF0ZSA9IHRydWU7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ0FwcGxpZWQgc3F1YXJlIFVWIG1hcHBpbmcgZm9yIEQ2IHdpdGggM3gyIGdyaWQgbGF5b3V0Jyk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhcHBseUQxMlBlbnRhZ29uVVZNYXBwaW5nKGdlb21ldHJ5OiBUSFJFRS5CdWZmZXJHZW9tZXRyeSk6IHZvaWQge1xyXG4gICAgICAgIC8vIENvbnZlcnQgdG8gbm9uLWluZGV4ZWQgZ2VvbWV0cnkgc28gZWFjaCB0cmlhbmdsZSBoYXMgaXRzIG93biB2ZXJ0aWNlc1xyXG4gICAgICAgIGNvbnN0IG5vbkluZGV4ZWRHZW9tZXRyeSA9IGdlb21ldHJ5LnRvTm9uSW5kZXhlZCgpO1xyXG4gICAgICAgIGdlb21ldHJ5LmF0dHJpYnV0ZXMgPSBub25JbmRleGVkR2VvbWV0cnkuYXR0cmlidXRlcztcclxuICAgICAgICBnZW9tZXRyeS5pbmRleCA9IG51bGw7XHJcblxyXG4gICAgICAgIGNvbnN0IHV2QXR0cmlidXRlID0gZ2VvbWV0cnkuYXR0cmlidXRlcy51djtcclxuICAgICAgICBjb25zdCB1dkFycmF5ID0gdXZBdHRyaWJ1dGUuYXJyYXkgYXMgRmxvYXQzMkFycmF5O1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZygnQXBwbHlpbmcgRDEyIHBlbnRhZ29uIFVWIG1hcHBpbmcgZm9yIDR4MyBncmlkJyk7XHJcblxyXG4gICAgICAgIGNvbnN0IHRvdGFsVHJpYW5nbGVzID0gdXZBdHRyaWJ1dGUuY291bnQgLyAzO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBEMTI6ICR7dG90YWxUcmlhbmdsZXN9IHRyaWFuZ2xlcyB0b3RhbGApO1xyXG5cclxuICAgICAgICAvLyA0eDMgZ3JpZCBmb3IgMTIgcGVudGFnb24gZmFjZXMgb24gMTAyNHgxMDI0IGltYWdlXHJcbiAgICAgICAgY29uc3QgY29scyA9IDQ7XHJcbiAgICAgICAgY29uc3Qgcm93cyA9IDM7XHJcbiAgICAgICAgY29uc3QgY2VsbFdpZHRoID0gMS4wIC8gY29scztcclxuICAgICAgICBjb25zdCBjZWxsSGVpZ2h0ID0gMS4wIC8gcm93cztcclxuICAgICAgICBjb25zdCBwYWRkaW5nID0gMC4wMjtcclxuXHJcbiAgICAgICAgLy8gRG9kZWNhaGVkcm9uR2VvbWV0cnkgY3JlYXRlcyA2MCB0cmlhbmdsZXMgKDUgcGVyIGZhY2UgZm9yIGNlbnRlci1iYXNlZCB0cmlhbmd1bGF0aW9uKVxyXG4gICAgICAgIGNvbnN0IHRyaWFuZ2xlc1BlckZhY2UgPSB0b3RhbFRyaWFuZ2xlcyAvIDEyO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBUcmlhbmdsZXMgcGVyIGZhY2U6ICR7dHJpYW5nbGVzUGVyRmFjZX1gKTtcclxuXHJcbiAgICAgICAgLy8gUHJvY2VzcyBlYWNoIHBlbnRhZ29uIGZhY2VcclxuICAgICAgICBmb3IgKGxldCBmYWNlSW5kZXggPSAwOyBmYWNlSW5kZXggPCAxMjsgZmFjZUluZGV4KyspIHtcclxuICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIGdyaWQgcG9zaXRpb25cclxuICAgICAgICAgICAgY29uc3QgY29sID0gZmFjZUluZGV4ICUgY29scztcclxuICAgICAgICAgICAgY29uc3Qgcm93ID0gTWF0aC5mbG9vcihmYWNlSW5kZXggLyBjb2xzKTtcclxuXHJcbiAgICAgICAgICAgIC8vIENhbGN1bGF0ZSBjZWxsIGJvdW5kcyB3aXRoIHBhZGRpbmdcclxuICAgICAgICAgICAgY29uc3QgY2VsbExlZnQgPSBjb2wgKiBjZWxsV2lkdGggKyBwYWRkaW5nO1xyXG4gICAgICAgICAgICBjb25zdCBjZWxsUmlnaHQgPSAoY29sICsgMSkgKiBjZWxsV2lkdGggLSBwYWRkaW5nO1xyXG4gICAgICAgICAgICBjb25zdCBjZWxsVG9wID0gcm93ICogY2VsbEhlaWdodCArIHBhZGRpbmc7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxCb3R0b20gPSAocm93ICsgMSkgKiBjZWxsSGVpZ2h0IC0gcGFkZGluZztcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxDZW50ZXJYID0gKGNlbGxMZWZ0ICsgY2VsbFJpZ2h0KSAvIDI7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxDZW50ZXJZID0gKGNlbGxUb3AgKyBjZWxsQm90dG9tKSAvIDI7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxXID0gY2VsbFJpZ2h0IC0gY2VsbExlZnQ7XHJcbiAgICAgICAgICAgIGNvbnN0IGNlbGxIID0gY2VsbEJvdHRvbSAtIGNlbGxUb3A7XHJcbiAgICAgICAgICAgIGNvbnN0IHBlbnRhZ29uUmFkaXVzID0gTWF0aC5taW4oY2VsbFcsIGNlbGxIKSAqIDAuNDtcclxuXHJcbiAgICAgICAgICAgIC8vIEdlbmVyYXRlIHBlbnRhZ29uIHZlcnRpY2VzOiB2MSBhdCB0b3AsIHRoZW4gY2xvY2t3aXNlIHYyLCB2MywgdjQsIHY1XHJcbiAgICAgICAgICAgIGNvbnN0IHBlbnRhZ29uVmVydGljZXMgPSBbXTtcclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCA1OyBpKyspIHtcclxuICAgICAgICAgICAgICAgIC8vIFN0YXJ0IGZyb20gdG9wICgtOTDCsCkgYW5kIGdvIGNsb2Nrd2lzZVxyXG4gICAgICAgICAgICAgICAgY29uc3QgYW5nbGUgPSAoaSAqIDIgKiBNYXRoLlBJKSAvIDUgLSBNYXRoLlBJIC8gMiArIChNYXRoLlBJIC8gNSk7XHJcbiAgICAgICAgICAgICAgICBwZW50YWdvblZlcnRpY2VzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgIHg6IGNlbGxDZW50ZXJYICsgTWF0aC5jb3MoYW5nbGUpICogcGVudGFnb25SYWRpdXMsXHJcbiAgICAgICAgICAgICAgICAgICAgeTogY2VsbENlbnRlclkgKyBNYXRoLnNpbihhbmdsZSkgKiBwZW50YWdvblJhZGl1c1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIE5vdyBwZW50YWdvblZlcnRpY2VzWzBdID0gdjEgKHRvcClcclxuICAgICAgICAgICAgLy8gcGVudGFnb25WZXJ0aWNlc1sxXSA9IHYyIChjbG9ja3dpc2UgZnJvbSB2MSlcclxuICAgICAgICAgICAgLy8gcGVudGFnb25WZXJ0aWNlc1syXSA9IHYzIChjbG9ja3dpc2UgZnJvbSB2MilcclxuICAgICAgICAgICAgLy8gcGVudGFnb25WZXJ0aWNlc1szXSA9IHY0IChjbG9ja3dpc2UgZnJvbSB2MylcclxuICAgICAgICAgICAgLy8gcGVudGFnb25WZXJ0aWNlc1s0XSA9IHY1IChjbG9ja3dpc2UgZnJvbSB2NClcclxuXHJcbiAgICAgICAgICAgIC8vIE1hcCB0cmlhbmdsZXMgZm9yIHRoaXMgZmFjZVxyXG4gICAgICAgICAgICBjb25zdCBiYXNlVHJpYW5nbGUgPSBNYXRoLmZsb29yKGZhY2VJbmRleCAqIHRyaWFuZ2xlc1BlckZhY2UpO1xyXG4gICAgICAgICAgICBjb25zdCBlbmRUcmlhbmdsZSA9IE1hdGguZmxvb3IoKGZhY2VJbmRleCArIDEpICogdHJpYW5nbGVzUGVyRmFjZSk7XHJcblxyXG4gICAgICAgICAgICBmb3IgKGxldCB0cmlhbmdsZUlkeCA9IGJhc2VUcmlhbmdsZTsgdHJpYW5nbGVJZHggPCBlbmRUcmlhbmdsZSAmJiB0cmlhbmdsZUlkeCA8IHRvdGFsVHJpYW5nbGVzOyB0cmlhbmdsZUlkeCsrKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBsb2NhbFRyaWFuZ2xlID0gdHJpYW5nbGVJZHggLSBiYXNlVHJpYW5nbGU7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB2ZXJ0ZXhPZmZzZXQgPSB0cmlhbmdsZUlkeCAqIDM7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB1dkluZGV4ID0gdmVydGV4T2Zmc2V0ICogMjtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAodHJpYW5nbGVzUGVyRmFjZSA9PT0gNSkge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIDUgdHJpYW5nbGVzIHBlciBmYWNlOiBmYW4gZnJvbSBjZW50ZXJcclxuICAgICAgICAgICAgICAgICAgICAvLyBFYWNoIHRyaWFuZ2xlIGdvZXMgZnJvbSBjZW50ZXIgdG8gdHdvIGNvbnNlY3V0aXZlIHZlcnRpY2VzXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdjEgPSB7IHg6IGNlbGxDZW50ZXJYLCB5OiBjZWxsQ2VudGVyWSB9OyAvLyBDZW50ZXJcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB2MiA9IHBlbnRhZ29uVmVydGljZXNbbG9jYWxUcmlhbmdsZSAlIDVdO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHYzID0gcGVudGFnb25WZXJ0aWNlc1sobG9jYWxUcmlhbmdsZSArIDEpICUgNV07XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleF0gPSB2MS54O1xyXG4gICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDFdID0gdjEueTtcclxuICAgICAgICAgICAgICAgICAgICB1dkFycmF5W3V2SW5kZXggKyAyXSA9IHYyLng7XHJcbiAgICAgICAgICAgICAgICAgICAgdXZBcnJheVt1dkluZGV4ICsgM10gPSB2Mi55O1xyXG4gICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDRdID0gdjMueDtcclxuICAgICAgICAgICAgICAgICAgICB1dkFycmF5W3V2SW5kZXggKyA1XSA9IHYzLnk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHRyaWFuZ2xlc1BlckZhY2UgPT09IDMpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyAzIHRyaWFuZ2xlcyBwZXIgZmFjZTogZmFuIGZyb20gdjEgKHRvcCB2ZXJ0ZXgpXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGxvY2FsVHJpYW5nbGUgPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhpcmQgdHJpYW5nbGU6IHYxLCB2NCwgdjVcclxuICAgICAgICAgICAgICAgICAgICAgICAgdXZBcnJheVt1dkluZGV4XSA9IHBlbnRhZ29uVmVydGljZXNbNF0ueDsgICAgIC8vIHYxICh0b3ApXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDFdID0gcGVudGFnb25WZXJ0aWNlc1s0XS55O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB1dkFycmF5W3V2SW5kZXggKyAyXSA9IHBlbnRhZ29uVmVydGljZXNbMF0ueDsgLy8gdjRcclxuICAgICAgICAgICAgICAgICAgICAgICAgdXZBcnJheVt1dkluZGV4ICsgM10gPSBwZW50YWdvblZlcnRpY2VzWzBdLnk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDRdID0gcGVudGFnb25WZXJ0aWNlc1szXS54OyAvLyB2NVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB1dkFycmF5W3V2SW5kZXggKyA1XSA9IHBlbnRhZ29uVmVydGljZXNbM10ueTtcclxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGxvY2FsVHJpYW5nbGUgPT09IDEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gU2Vjb25kIHRyaWFuZ2xlOiB2MSwgdjMsIHY0XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleF0gPSBwZW50YWdvblZlcnRpY2VzWzJdLng7ICAgICAvLyB2MSAodG9wKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB1dkFycmF5W3V2SW5kZXggKyAxXSA9IHBlbnRhZ29uVmVydGljZXNbMl0ueTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdXZBcnJheVt1dkluZGV4ICsgMl0gPSBwZW50YWdvblZlcnRpY2VzWzNdLng7IC8vIHYzXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDNdID0gcGVudGFnb25WZXJ0aWNlc1szXS55O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB1dkFycmF5W3V2SW5kZXggKyA0XSA9IHBlbnRhZ29uVmVydGljZXNbMF0ueDsgLy8gdjRcclxuICAgICAgICAgICAgICAgICAgICAgICAgdXZBcnJheVt1dkluZGV4ICsgNV0gPSBwZW50YWdvblZlcnRpY2VzWzBdLnk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChsb2NhbFRyaWFuZ2xlID09PSAyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZpcnN0IHRyaWFuZ2xlOiB2MSwgdjIsIHYzXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleF0gPSBwZW50YWdvblZlcnRpY2VzWzBdLng7ICAgICAvLyB2MSAodG9wKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB1dkFycmF5W3V2SW5kZXggKyAxXSA9IHBlbnRhZ29uVmVydGljZXNbMF0ueTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdXZBcnJheVt1dkluZGV4ICsgMl0gPSBwZW50YWdvblZlcnRpY2VzWzFdLng7IC8vIHYyIChjbG9ja3dpc2UgZnJvbSB2MSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgdXZBcnJheVt1dkluZGV4ICsgM10gPSBwZW50YWdvblZlcnRpY2VzWzFdLnk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDRdID0gcGVudGFnb25WZXJ0aWNlc1syXS54OyAvLyB2MyAoY2xvY2t3aXNlIGZyb20gdjIpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDVdID0gcGVudGFnb25WZXJ0aWNlc1syXS55O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIEZhbGxiYWNrOiBkaXN0cmlidXRlIHRyaWFuZ2xlcyBhcm91bmQgcGVudGFnb25cclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBhbmdsZSA9IChsb2NhbFRyaWFuZ2xlIC8gdHJpYW5nbGVzUGVyRmFjZSkgKiBNYXRoLlBJICogMjtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBuZXh0QW5nbGUgPSAoKGxvY2FsVHJpYW5nbGUgKyAxKSAvIHRyaWFuZ2xlc1BlckZhY2UpICogTWF0aC5QSSAqIDI7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleF0gPSBjZWxsQ2VudGVyWDtcclxuICAgICAgICAgICAgICAgICAgICB1dkFycmF5W3V2SW5kZXggKyAxXSA9IGNlbGxDZW50ZXJZO1xyXG4gICAgICAgICAgICAgICAgICAgIHV2QXJyYXlbdXZJbmRleCArIDJdID0gY2VsbENlbnRlclggKyBNYXRoLmNvcyhhbmdsZSkgKiBwZW50YWdvblJhZGl1cztcclxuICAgICAgICAgICAgICAgICAgICB1dkFycmF5W3V2SW5kZXggKyAzXSA9IGNlbGxDZW50ZXJZICsgTWF0aC5zaW4oYW5nbGUpICogcGVudGFnb25SYWRpdXM7XHJcbiAgICAgICAgICAgICAgICAgICAgdXZBcnJheVt1dkluZGV4ICsgNF0gPSBjZWxsQ2VudGVyWCArIE1hdGguY29zKG5leHRBbmdsZSkgKiBwZW50YWdvblJhZGl1cztcclxuICAgICAgICAgICAgICAgICAgICB1dkFycmF5W3V2SW5kZXggKyA1XSA9IGNlbGxDZW50ZXJZICsgTWF0aC5zaW4obmV4dEFuZ2xlKSAqIHBlbnRhZ29uUmFkaXVzO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB1dkF0dHJpYnV0ZS5uZWVkc1VwZGF0ZSA9IHRydWU7XHJcbiAgICAgICAgY29uc29sZS5sb2coJ0FwcGxpZWQgYWRhcHRpdmUgRDEyIHBlbnRhZ29uIFVWIG1hcHBpbmcnKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBNVUxUSS1ESUNFIEhFTFBFUiBNRVRIT0RTXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRGYWNlQ291bnRGb3JEaWNlVHlwZShkaWNlVHlwZTogc3RyaW5nKTogbnVtYmVyIHtcclxuICAgICAgICBzd2l0Y2ggKGRpY2VUeXBlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2Q0JzogcmV0dXJuIDQ7XHJcbiAgICAgICAgICAgIGNhc2UgJ2Q2JzogcmV0dXJuIDY7XHJcbiAgICAgICAgICAgIGNhc2UgJ2Q4JzogcmV0dXJuIDg7XHJcbiAgICAgICAgICAgIGNhc2UgJ2QxMCc6IHJldHVybiAxMDtcclxuICAgICAgICAgICAgY2FzZSAnZDEyJzogcmV0dXJuIDEyO1xyXG4gICAgICAgICAgICBjYXNlICdkMjAnOiByZXR1cm4gMjA7XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6IHJldHVybiAyMDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY3JlYXRlU2luZ2xlRGljZShkaWNlVHlwZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgICAgICAgLy8gQ3JlYXRlIGdlb21ldHJ5IGJhc2VkIG9uIGRpY2UgdHlwZVxyXG4gICAgICAgIGNvbnN0IGdlb21ldHJ5ID0gdGhpcy5jcmVhdGVHZW9tZXRyeUZvckRpY2VUeXBlKGRpY2VUeXBlKTtcclxuXHJcbiAgICAgICAgLy8gQXBwbHkgVVYgbWFwcGluZ1xyXG4gICAgICAgIHRoaXMuYXBwbHlVVk1hcHBpbmdGb3JEaWNlVHlwZShnZW9tZXRyeSwgZGljZVR5cGUpO1xyXG5cclxuICAgICAgICAvLyBDcmVhdGUgbWF0ZXJpYWwgd2l0aCBpbmRpdmlkdWFsIHNjYWxpbmdcclxuICAgICAgICBjb25zdCBtYXRlcmlhbCA9IHRoaXMuY3JlYXRlTWF0ZXJpYWxGb3JEaWNlVHlwZShkaWNlVHlwZSk7XHJcblxyXG4gICAgICAgIC8vIENyZWF0ZSBtZXNoXHJcbiAgICAgICAgY29uc3QgbWVzaCA9IG5ldyBUSFJFRS5NZXNoKGdlb21ldHJ5LCBtYXRlcmlhbCk7XHJcblxyXG4gICAgICAgIC8vIFBvc2l0aW9uIGRpY2UgdG8gcHJldmVudCBvdmVybGFwcGluZ1xyXG4gICAgICAgIGNvbnN0IHBvc2l0aW9uID0gdGhpcy5nZXROZXh0RGljZVBvc2l0aW9uKCk7XHJcbiAgICAgICAgbWVzaC5wb3NpdGlvbi5jb3B5KHBvc2l0aW9uKTtcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIHBoeXNpY3MgYm9keVxyXG4gICAgICAgIGNvbnN0IGJvZHkgPSB0aGlzLmNyZWF0ZVBoeXNpY3NCb2R5Rm9yRGljZVR5cGUoZGljZVR5cGUpO1xyXG4gICAgICAgIGJvZHkucG9zaXRpb24uc2V0KHBvc2l0aW9uLngsIHBvc2l0aW9uLnksIHBvc2l0aW9uLnopO1xyXG5cclxuICAgICAgICAvLyBBZGQgdG8gc2NlbmUgYW5kIHdvcmxkXHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQobWVzaCk7XHJcbiAgICAgICAgdGhpcy53b3JsZC5hZGRCb2R5KGJvZHkpO1xyXG5cclxuICAgICAgICAvLyBEZWJ1ZzogVmVyaWZ5IGJvZHkgaXMgaW4gd29ybGQgd2l0aCBjb3JyZWN0IGRhbXBpbmdcclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+UjSBCb2R5IGFkZGVkIHRvIHdvcmxkLiBJbiB3b3JsZDogJHt0aGlzLndvcmxkLmJvZGllcy5pbmNsdWRlcyhib2R5KX0sIGRhbXBpbmc6IGxpbmVhcj0ke2JvZHkubGluZWFyRGFtcGluZ30sIGFuZ3VsYXI9JHtib2R5LmFuZ3VsYXJEYW1waW5nfWApO1xyXG5cclxuICAgICAgICAvLyBBZGQgdG8gdHJhY2tpbmcgYXJyYXlzXHJcbiAgICAgICAgdGhpcy5kaWNlQXJyYXkucHVzaChtZXNoKTtcclxuICAgICAgICB0aGlzLmRpY2VCb2R5QXJyYXkucHVzaChib2R5KTtcclxuICAgICAgICB0aGlzLmRpY2VUeXBlQXJyYXkucHVzaChkaWNlVHlwZSk7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKGBDcmVhdGVkICR7ZGljZVR5cGV9IGRpY2UuIFRvdGFsIGRpY2U6ICR7dGhpcy5kaWNlQXJyYXkubGVuZ3RofWApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY3JlYXRlR2VvbWV0cnlGb3JEaWNlVHlwZShkaWNlVHlwZTogc3RyaW5nKTogVEhSRUUuQnVmZmVyR2VvbWV0cnkge1xyXG4gICAgICAgIGNvbnN0IGJhc2VTaXplID0gdGhpcy5zZXR0aW5ncy5kaWNlU2l6ZTtcclxuICAgICAgICBjb25zdCBzY2FsZSA9IHRoaXMuc2V0dGluZ3MuZGljZVNjYWxlc1tkaWNlVHlwZSBhcyBrZXlvZiB0eXBlb2YgdGhpcy5zZXR0aW5ncy5kaWNlU2NhbGVzXSB8fCAxLjA7XHJcbiAgICAgICAgY29uc3Qgc2l6ZSA9IGJhc2VTaXplICogc2NhbGU7XHJcblxyXG4gICAgICAgIHN3aXRjaCAoZGljZVR5cGUpIHtcclxuICAgICAgICAgICAgY2FzZSAnZDQnOlxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBUSFJFRS5UZXRyYWhlZHJvbkdlb21ldHJ5KHNpemUsIDApO1xyXG4gICAgICAgICAgICBjYXNlICdkNic6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFRIUkVFLkJveEdlb21ldHJ5KHNpemUgKiAyLCBzaXplICogMiwgc2l6ZSAqIDIpO1xyXG4gICAgICAgICAgICBjYXNlICdkOCc6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFRIUkVFLk9jdGFoZWRyb25HZW9tZXRyeShzaXplLCAwKTtcclxuICAgICAgICAgICAgY2FzZSAnZDEwJzpcclxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmNyZWF0ZUQxMFBvbHloZWRyb25HZW9tZXRyeShzaXplKTtcclxuICAgICAgICAgICAgY2FzZSAnZDEyJzpcclxuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgVEhSRUUuRG9kZWNhaGVkcm9uR2VvbWV0cnkoc2l6ZSwgMCk7XHJcbiAgICAgICAgICAgIGNhc2UgJ2QyMCc6XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFRIUkVFLkljb3NhaGVkcm9uR2VvbWV0cnkoc2l6ZSwgMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYXBwbHlVVk1hcHBpbmdGb3JEaWNlVHlwZShnZW9tZXRyeTogVEhSRUUuQnVmZmVyR2VvbWV0cnksIGRpY2VUeXBlOiBzdHJpbmcpOiB2b2lkIHtcclxuICAgICAgICBzd2l0Y2ggKGRpY2VUeXBlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2Q0JzpcclxuICAgICAgICAgICAgICAgIHRoaXMuYXBwbHlUcmlhbmdsZVVWTWFwcGluZyhnZW9tZXRyeSwgNCk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnZDYnOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5hcHBseVNxdWFyZVVWTWFwcGluZyhnZW9tZXRyeSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnZDgnOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5hcHBseVRyaWFuZ2xlVVZNYXBwaW5nKGdlb21ldHJ5LCA4KTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICBjYXNlICdkMTAnOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5hcHBseUQxMFVWTWFwcGluZyhnZW9tZXRyeSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnZDEyJzpcclxuICAgICAgICAgICAgICAgIHRoaXMuYXBwbHlEMTJQZW50YWdvblVWTWFwcGluZyhnZW9tZXRyeSk7XHJcbiAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgY2FzZSAnZDIwJzpcclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIHRoaXMuYXBwbHlUcmlhbmdsZVVWTWFwcGluZyhnZW9tZXRyeSwgMjApO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY3JlYXRlTWF0ZXJpYWxGb3JEaWNlVHlwZShkaWNlVHlwZTogc3RyaW5nKTogVEhSRUUuTWVzaFBob25nTWF0ZXJpYWwge1xyXG4gICAgICAgIGNvbnN0IG1hdGVyaWFsUHJvcHM6IGFueSA9IHtcclxuICAgICAgICAgICAgY29sb3I6IHRoaXMuc2V0dGluZ3MuZGljZUNvbG9yLFxyXG4gICAgICAgICAgICBzaGluaW5lc3M6IHRoaXMuc2V0dGluZ3MuZGljZVNoaW5pbmVzcyxcclxuICAgICAgICAgICAgc3BlY3VsYXI6IHRoaXMuc2V0dGluZ3MuZGljZVNwZWN1bGFyLFxyXG4gICAgICAgICAgICB0cmFuc3BhcmVudDogdGhpcy5zZXR0aW5ncy5kaWNlVHJhbnNwYXJlbnQsXHJcbiAgICAgICAgICAgIG9wYWNpdHk6IHRoaXMuc2V0dGluZ3MuZGljZU9wYWNpdHlcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBBcHBseSBkaWNlIHRleHR1cmUgaWYgYXZhaWxhYmxlXHJcbiAgICAgICAgY29uc3QgdGV4dHVyZURhdGEgPSB0aGlzLmdldERpY2VUZXh0dXJlRGF0YUZvclR5cGUoZGljZVR5cGUpO1xyXG4gICAgICAgIGlmICh0ZXh0dXJlRGF0YSkge1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0dXJlID0gdGhpcy5sb2FkVGV4dHVyZUZyb21EYXRhKHRleHR1cmVEYXRhKTtcclxuICAgICAgICAgICAgaWYgKHRleHR1cmUpIHtcclxuICAgICAgICAgICAgICAgIG1hdGVyaWFsUHJvcHMubWFwID0gdGV4dHVyZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQXBwbHkgbm9ybWFsIG1hcCBpZiBhdmFpbGFibGVcclxuICAgICAgICBjb25zdCBub3JtYWxNYXBEYXRhID0gdGhpcy5nZXREaWNlTm9ybWFsTWFwRGF0YUZvclR5cGUoZGljZVR5cGUpO1xyXG4gICAgICAgIGlmIChub3JtYWxNYXBEYXRhKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG5vcm1hbE1hcCA9IHRoaXMubG9hZE5vcm1hbE1hcEZyb21EYXRhKG5vcm1hbE1hcERhdGEpO1xyXG4gICAgICAgICAgICBpZiAobm9ybWFsTWFwKSB7XHJcbiAgICAgICAgICAgICAgICBtYXRlcmlhbFByb3BzLm5vcm1hbE1hcCA9IG5vcm1hbE1hcDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaFBob25nTWF0ZXJpYWwobWF0ZXJpYWxQcm9wcyk7XHJcblxyXG4gICAgICAgIC8vIENvbmZpZ3VyZSBzaGFkb3cgcHJvcGVydGllcyBiYXNlZCBvbiBzZXR0aW5nc1xyXG4gICAgICAgIG1hdGVyaWFsLmNhc3RTaGFkb3cgPSB0aGlzLnNldHRpbmdzLmRpY2VDYXN0U2hhZG93O1xyXG4gICAgICAgIG1hdGVyaWFsLnJlY2VpdmVTaGFkb3cgPSB0aGlzLnNldHRpbmdzLmRpY2VSZWNlaXZlU2hhZG93O1xyXG5cclxuICAgICAgICByZXR1cm4gbWF0ZXJpYWw7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXREaWNlVGV4dHVyZURhdGFGb3JUeXBlKGRpY2VUeXBlOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5zZXR0aW5ncy5kaWNlVGV4dHVyZXNbZGljZVR5cGUgYXMga2V5b2YgdHlwZW9mIHRoaXMuc2V0dGluZ3MuZGljZVRleHR1cmVzXSB8fCBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2V0RGljZU5vcm1hbE1hcERhdGFGb3JUeXBlKGRpY2VUeXBlOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcclxuICAgICAgICByZXR1cm4gdGhpcy5zZXR0aW5ncy5kaWNlTm9ybWFsTWFwc1tkaWNlVHlwZSBhcyBrZXlvZiB0eXBlb2YgdGhpcy5zZXR0aW5ncy5kaWNlTm9ybWFsTWFwc10gfHwgbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGxvYWRUZXh0dXJlRnJvbURhdGEodGV4dHVyZURhdGE6IHN0cmluZyk6IFRIUkVFLlRleHR1cmUgfCBudWxsIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBsb2FkZXIgPSBuZXcgVEhSRUUuVGV4dHVyZUxvYWRlcigpO1xyXG4gICAgICAgICAgICBjb25zdCB0ZXh0dXJlID0gbG9hZGVyLmxvYWQodGV4dHVyZURhdGEpO1xyXG4gICAgICAgICAgICB0ZXh0dXJlLndyYXBTID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XHJcbiAgICAgICAgICAgIHRleHR1cmUud3JhcFQgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcclxuICAgICAgICAgICAgcmV0dXJuIHRleHR1cmU7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKCdGYWlsZWQgdG8gbG9hZCBkaWNlIHRleHR1cmU6JywgZXJyb3IpO1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkTm9ybWFsTWFwRnJvbURhdGEobm9ybWFsTWFwRGF0YTogc3RyaW5nKTogVEhSRUUuVGV4dHVyZSB8IG51bGwge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGxvYWRlciA9IG5ldyBUSFJFRS5UZXh0dXJlTG9hZGVyKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IG5vcm1hbE1hcCA9IGxvYWRlci5sb2FkKG5vcm1hbE1hcERhdGEpO1xyXG4gICAgICAgICAgICBub3JtYWxNYXAud3JhcFMgPSBUSFJFRS5SZXBlYXRXcmFwcGluZztcclxuICAgICAgICAgICAgbm9ybWFsTWFwLndyYXBUID0gVEhSRUUuUmVwZWF0V3JhcHBpbmc7XHJcbiAgICAgICAgICAgIHJldHVybiBub3JtYWxNYXA7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKCdGYWlsZWQgdG8gbG9hZCBkaWNlIG5vcm1hbCBtYXA6JywgZXJyb3IpO1xyXG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjcmVhdGVQaHlzaWNzQm9keUZvckRpY2VUeXBlKGRpY2VUeXBlOiBzdHJpbmcpOiBDQU5OT04uQm9keSB7XHJcbiAgICAgICAgY29uc3QgYmFzZVNpemUgPSB0aGlzLnNldHRpbmdzLmRpY2VTaXplO1xyXG4gICAgICAgIGNvbnN0IHNjYWxlID0gdGhpcy5zZXR0aW5ncy5kaWNlU2NhbGVzW2RpY2VUeXBlIGFzIGtleW9mIHR5cGVvZiB0aGlzLnNldHRpbmdzLmRpY2VTY2FsZXNdIHx8IDEuMDtcclxuICAgICAgICBjb25zdCBzaXplID0gYmFzZVNpemUgKiBzY2FsZTtcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIHByb3BlciBwaHlzaWNzIHNoYXBlIGJhc2VkIG9uIGRpY2UgdHlwZVxyXG4gICAgICAgIGNvbnN0IHNoYXBlID0gdGhpcy5jcmVhdGVQaHlzaWNzU2hhcGVGb3JEaWNlVHlwZShkaWNlVHlwZSwgc2l6ZSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJvZHkgPSBuZXcgQ0FOTk9OLkJvZHkoe1xyXG4gICAgICAgICAgICBtYXNzOiAxLFxyXG4gICAgICAgICAgICBtYXRlcmlhbDogbmV3IENBTk5PTi5NYXRlcmlhbCh7XHJcbiAgICAgICAgICAgICAgICBmcmljdGlvbjogMC40LFxyXG4gICAgICAgICAgICAgICAgcmVzdGl0dXRpb246IDAuM1xyXG4gICAgICAgICAgICB9KVxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBib2R5LmFkZFNoYXBlKHNoYXBlKTtcclxuICAgICAgICBib2R5LmxpbmVhckRhbXBpbmcgPSAwLjE7IC8vIE5vcm1hbCBkYW1waW5nXHJcbiAgICAgICAgYm9keS5hbmd1bGFyRGFtcGluZyA9IDAuMTsgLy8gTm9ybWFsIGRhbXBpbmdcclxuXHJcbiAgICAgICAgLy8gRGVidWc6IExvZyB0aGUgcGh5c2ljcyBwYXJhbWV0ZXJzIHRvIGNvbmZpcm0gdGhleSdyZSBhcHBsaWVkXHJcbiAgICAgICAgY29uc29sZS5sb2coYPCfjrIgQ3JlYXRlZCBkaWNlIGJvZHk6IG1hc3M9JHtib2R5Lm1hc3N9LCBmcmljdGlvbj0ke2JvZHkubWF0ZXJpYWw/LmZyaWN0aW9ufSwgcmVzdGl0dXRpb249JHtib2R5Lm1hdGVyaWFsPy5yZXN0aXR1dGlvbn0sIGxpbmVhckRhbXBpbmc9JHtib2R5LmxpbmVhckRhbXBpbmd9LCBhbmd1bGFyRGFtcGluZz0ke2JvZHkuYW5ndWxhckRhbXBpbmd9YCk7XHJcblxyXG4gICAgICAgIC8vIEVuYWJsZSBzbGVlcGluZyBmb3IgYmV0dGVyIHBlcmZvcm1hbmNlXHJcbiAgICAgICAgYm9keS5hbGxvd1NsZWVwID0gdHJ1ZTtcclxuICAgICAgICBib2R5LnNsZWVwU3BlZWRMaW1pdCA9IDAuMTtcclxuICAgICAgICBib2R5LnNsZWVwVGltZUxpbWl0ID0gMTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGJvZHk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjcmVhdGVQaHlzaWNzU2hhcGVGb3JEaWNlVHlwZShkaWNlVHlwZTogc3RyaW5nLCBzaXplOiBudW1iZXIpOiBDQU5OT04uU2hhcGUge1xyXG4gICAgICAgIHN3aXRjaCAoZGljZVR5cGUpIHtcclxuICAgICAgICAgICAgY2FzZSAnZDYnOlxyXG4gICAgICAgICAgICAgICAgLy8gRDYgdXNlcyBib3ggc2hhcGUgZm9yIHByb3BlciBjdWJlIHBoeXNpY3NcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5S3IENyZWF0aW5nIEJveCBwaHlzaWNzIHNoYXBlIGZvciAke2RpY2VUeXBlfWApO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBDQU5OT04uQm94KG5ldyBDQU5OT04uVmVjMyhzaXplLCBzaXplLCBzaXplKSk7XHJcblxyXG4gICAgICAgICAgICBjYXNlICdkNCc6XHJcbiAgICAgICAgICAgIGNhc2UgJ2Q4JzpcclxuICAgICAgICAgICAgY2FzZSAnZDEwJzpcclxuICAgICAgICAgICAgY2FzZSAnZDEyJzpcclxuICAgICAgICAgICAgY2FzZSAnZDIwJzpcclxuICAgICAgICAgICAgICAgIC8vIEZvciBjb21wbGV4IHNoYXBlcywgY3JlYXRlIGNvbnZleCBwb2x5aGVkcm9uIGZyb20gZ2VvbWV0cnlcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5S4IENyZWF0aW5nIENvbnZleFBvbHloZWRyb24gcGh5c2ljcyBzaGFwZSBmb3IgJHtkaWNlVHlwZX1gKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGdlb21ldHJ5ID0gdGhpcy5jcmVhdGVHZW9tZXRyeUZvckRpY2VUeXBlKGRpY2VUeXBlKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbnZleFNoYXBlID0gdGhpcy5jcmVhdGVDb252ZXhQb2x5aGVkcm9uRnJvbUdlb21ldHJ5KGdlb21ldHJ5KTtcclxuICAgICAgICAgICAgICAgIGdlb21ldHJ5LmRpc3Bvc2UoKTsgLy8gQ2xlYW4gdXAgZ2VvbWV0cnkgYWZ0ZXIgY3JlYXRpbmcgcGh5c2ljcyBzaGFwZVxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnZleFNoYXBlO1xyXG5cclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIC8vIEZhbGxiYWNrIHRvIHNwaGVyZSBmb3IgdW5rbm93biBkaWNlIHR5cGVzXHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYOKaoO+4jyBVbmtub3duIGRpY2UgdHlwZSAke2RpY2VUeXBlfSwgdXNpbmcgc3BoZXJlIHNoYXBlYCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IENBTk5PTi5TcGhlcmUoc2l6ZSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2V0TmV4dERpY2VQb3NpdGlvbigpOiBUSFJFRS5WZWN0b3IzIHtcclxuICAgICAgICBjb25zdCBncmlkU2l6ZSA9IDIuNTsgLy8gU3BhY2UgYmV0d2VlbiBkaWNlXHJcbiAgICAgICAgY29uc3QgY29scyA9IDg7IC8vIERpY2UgcGVyIHJvd1xyXG4gICAgICAgIGNvbnN0IHRvdGFsRGljZSA9IHRoaXMuZGljZUFycmF5Lmxlbmd0aDtcclxuXHJcbiAgICAgICAgY29uc3QgY29sID0gdG90YWxEaWNlICUgY29scztcclxuICAgICAgICBjb25zdCByb3cgPSBNYXRoLmZsb29yKHRvdGFsRGljZSAvIGNvbHMpO1xyXG5cclxuICAgICAgICByZXR1cm4gbmV3IFRIUkVFLlZlY3RvcjMoXHJcbiAgICAgICAgICAgIChjb2wgLSBjb2xzIC8gMikgKiBncmlkU2l6ZSxcclxuICAgICAgICAgICAgdGhpcy5mbG9vckhlaWdodCArIDIsIC8vIFN0YXJ0IGFib3ZlIGZsb29yXHJcbiAgICAgICAgICAgIChyb3cgLSAyKSAqIGdyaWRTaXplXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcblxyXG4gICAgY2xlYXJBbGxEaWNlKCk6IHZvaWQge1xyXG4gICAgICAgIC8vIFJlbW92ZSBhbGwgZGljZSBmcm9tIHNjZW5lXHJcbiAgICAgICAgZm9yIChjb25zdCBtZXNoIG9mIHRoaXMuZGljZUFycmF5KSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2NlbmUucmVtb3ZlKG1lc2gpO1xyXG4gICAgICAgICAgICBpZiAobWVzaC5nZW9tZXRyeSkgbWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XHJcbiAgICAgICAgICAgIGlmIChtZXNoLm1hdGVyaWFsICYmICFBcnJheS5pc0FycmF5KG1lc2gubWF0ZXJpYWwpKSB7XHJcbiAgICAgICAgICAgICAgICBtZXNoLm1hdGVyaWFsLmRpc3Bvc2UoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gUmVtb3ZlIGFsbCBwaHlzaWNzIGJvZGllc1xyXG4gICAgICAgIGZvciAoY29uc3QgYm9keSBvZiB0aGlzLmRpY2VCb2R5QXJyYXkpIHtcclxuICAgICAgICAgICAgdGhpcy53b3JsZC5yZW1vdmVCb2R5KGJvZHkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2xlYXIgYXJyYXlzXHJcbiAgICAgICAgdGhpcy5kaWNlQXJyYXkubGVuZ3RoID0gMDtcclxuICAgICAgICB0aGlzLmRpY2VCb2R5QXJyYXkubGVuZ3RoID0gMDtcclxuICAgICAgICB0aGlzLmRpY2VUeXBlQXJyYXkubGVuZ3RoID0gMDtcclxuICAgICAgICB0aGlzLnNlbGVjdGVkRGljZS5sZW5ndGggPSAwO1xyXG4gICAgICAgIHRoaXMuZHJhZ2dlZERpY2VJbmRleCA9IC0xO1xyXG4gICAgfVxyXG5cclxuICAgIHJlbW92ZVNpbmdsZURpY2UoZGljZVR5cGU6IHN0cmluZyk6IGJvb2xlYW4ge1xyXG4gICAgICAgIC8vIEZpbmQgdGhlIGxhc3QgZGljZSBvZiB0aGUgc3BlY2lmaWVkIHR5cGVcclxuICAgICAgICBmb3IgKGxldCBpID0gdGhpcy5kaWNlVHlwZUFycmF5Lmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XHJcbiAgICAgICAgICAgIGlmICh0aGlzLmRpY2VUeXBlQXJyYXlbaV0gPT09IGRpY2VUeXBlKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBSZW1vdmUgZnJvbSBzY2VuZVxyXG4gICAgICAgICAgICAgICAgY29uc3QgbWVzaCA9IHRoaXMuZGljZUFycmF5W2ldO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5zY2VuZS5yZW1vdmUobWVzaCk7XHJcbiAgICAgICAgICAgICAgICBpZiAobWVzaC5nZW9tZXRyeSkgbWVzaC5nZW9tZXRyeS5kaXNwb3NlKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAobWVzaC5tYXRlcmlhbCAmJiAhQXJyYXkuaXNBcnJheShtZXNoLm1hdGVyaWFsKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIG1lc2gubWF0ZXJpYWwuZGlzcG9zZSgpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBwaHlzaWNzIGJvZHlcclxuICAgICAgICAgICAgICAgIGNvbnN0IGJvZHkgPSB0aGlzLmRpY2VCb2R5QXJyYXlbaV07XHJcbiAgICAgICAgICAgICAgICB0aGlzLndvcmxkLnJlbW92ZUJvZHkoYm9keSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gUmVtb3ZlIGZyb20gYXJyYXlzXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRpY2VBcnJheS5zcGxpY2UoaSwgMSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmRpY2VCb2R5QXJyYXkuc3BsaWNlKGksIDEpO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5kaWNlVHlwZUFycmF5LnNwbGljZShpLCAxKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgc2VsZWN0ZWREaWNlIGFycmF5XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGVkRGljZSA9IHRoaXMuc2VsZWN0ZWREaWNlLmZpbHRlcihpbmRleCA9PiBpbmRleCAhPT0gaSk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnNlbGVjdGVkRGljZSA9IHRoaXMuc2VsZWN0ZWREaWNlLm1hcChpbmRleCA9PiBpbmRleCA+IGkgPyBpbmRleCAtIDEgOiBpbmRleCk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gVXBkYXRlIGRyYWdnZWREaWNlSW5kZXhcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmRyYWdnZWREaWNlSW5kZXggPT09IGkpIHtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmRyYWdnZWREaWNlSW5kZXggPSAtMTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5kcmFnZ2VkRGljZUluZGV4ID4gaSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZHJhZ2dlZERpY2VJbmRleC0tO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlOyAvLyBTdWNjZXNzZnVsbHkgcmVtb3ZlZFxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZTsgLy8gTm8gZGljZSBvZiB0aGlzIHR5cGUgZm91bmRcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldFJhbmRvbVJlc3VsdEZvckRpY2VUeXBlKGRpY2VUeXBlOiBzdHJpbmcpOiBudW1iZXIge1xyXG4gICAgICAgIGNvbnN0IGZhY2VDb3VudCA9IHRoaXMuZ2V0RmFjZUNvdW50Rm9yRGljZVR5cGUoZGljZVR5cGUpO1xyXG4gICAgICAgIHJldHVybiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBmYWNlQ291bnQpICsgMTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNoZWNrU2luZ2xlRGljZVNldHRsaW5nKGRpY2VJbmRleDogbnVtYmVyKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmlzUm9sbGluZyB8fCBkaWNlSW5kZXggPCAwIHx8IGRpY2VJbmRleCA+PSB0aGlzLmRpY2VCb2R5QXJyYXkubGVuZ3RoKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IGJvZHkgPSB0aGlzLmRpY2VCb2R5QXJyYXlbZGljZUluZGV4XTtcclxuICAgICAgICBjb25zdCBtb3Rpb25UaHJlc2hvbGQgPSB0aGlzLnNldHRpbmdzLm1vdGlvblRocmVzaG9sZDtcclxuICAgICAgICBjb25zdCB2ZWxvY2l0eVRocmVzaG9sZCA9IDAuMDUgLyBtb3Rpb25UaHJlc2hvbGQ7XHJcbiAgICAgICAgY29uc3QgYW5ndWxhclRocmVzaG9sZCA9IDAuNSAvIG1vdGlvblRocmVzaG9sZDtcclxuXHJcbiAgICAgICAgY29uc3QgdmVsb2NpdHkgPSBib2R5LnZlbG9jaXR5Lmxlbmd0aCgpO1xyXG4gICAgICAgIGNvbnN0IGFuZ3VsYXJWZWxvY2l0eSA9IGJvZHkuYW5ndWxhclZlbG9jaXR5Lmxlbmd0aCgpO1xyXG5cclxuICAgICAgICBjb25zdCBpc1NldHRsZWQgPSB2ZWxvY2l0eSA8PSB2ZWxvY2l0eVRocmVzaG9sZCAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgYW5ndWxhclZlbG9jaXR5IDw9IGFuZ3VsYXJUaHJlc2hvbGQgJiZcclxuICAgICAgICAgICAgICAgICAgICAgICAgIGJvZHkucG9zaXRpb24ueSA8PSAtMC41O1xyXG5cclxuICAgICAgICBpZiAoaXNTZXR0bGVkKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn46yIFNpbmdsZSBkaWNlICR7ZGljZUluZGV4fSBzZXR0bGVkYCk7XHJcbiAgICAgICAgICAgIHRoaXMuY29tcGxldGVTaW5nbGVEaWNlUm9sbChkaWNlSW5kZXgpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIENoZWNrIGFnYWluIGluIDEwMG1zXHJcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy5jaGVja1NpbmdsZURpY2VTZXR0bGluZyhkaWNlSW5kZXgpLCAxMDApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNvbXBsZXRlU2luZ2xlRGljZVJvbGwoZGljZUluZGV4OiBudW1iZXIpOiB2b2lkIHtcclxuICAgICAgICBpZiAodGhpcy5yb2xsVGltZW91dCkge1xyXG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5yb2xsVGltZW91dCk7XHJcbiAgICAgICAgICAgIHRoaXMucm9sbFRpbWVvdXQgPSBudWxsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZGljZVR5cGUgPSB0aGlzLmRpY2VUeXBlQXJyYXlbZGljZUluZGV4XTtcclxuXHJcbiAgICAgICAgLy8gV2FpdCAyIHNlY29uZHMgYmVmb3JlIGNoZWNraW5nIHJlc3VsdCB0byBtYXRjaCBtdWx0aS1kaWNlIGJlaGF2aW9yXHJcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgICAgIC8vIENoZWNrIGlmIGRpY2UgY2FuIGJlIHByb3Blcmx5IGRldGVjdGVkXHJcbiAgICAgICAgICAgIGNvbnN0IGNoZWNrUmVzdWx0ID0gdGhpcy5jaGVja0RpY2VSZXN1bHQoZGljZUluZGV4KTtcclxuXHJcbiAgICAgICAgICAgIGxldCBmb3JtYXR0ZWRSZXN1bHQ6IHN0cmluZztcclxuXHJcbiAgICAgICAgICAgIGlmIChjaGVja1Jlc3VsdC5pc0NhdWdodCkge1xyXG4gICAgICAgICAgICAgICAgLy8gRGljZSBpcyBjYXVnaHQgLSBoaWdobGlnaHQgaXQgYW5kIHNob3cgaW4gcmVzdWx0XHJcbiAgICAgICAgICAgICAgICB0aGlzLmhpZ2hsaWdodENhdWdodERpY2UoZGljZUluZGV4LCB0cnVlKTtcclxuICAgICAgICAgICAgICAgIGZvcm1hdHRlZFJlc3VsdCA9IGAxJHtkaWNlVHlwZX0oQ0FVR0hUKSA9IENBVUdIVCAtIEZhY2UgY29uZmlkZW5jZTogJHtjaGVja1Jlc3VsdC5jb25maWRlbmNlLnRvRml4ZWQoMyl9LCByZXF1aXJlZDogJHtjaGVja1Jlc3VsdC5yZXF1aXJlZENvbmZpZGVuY2UudG9GaXhlZCgzKX1gO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYPCfpYUgU2luZ2xlIGRpY2UgJHtkaWNlSW5kZXh9ICgke2RpY2VUeXBlfSkgQ0FVR0hUISBGYWNlIGNvbmZpZGVuY2U6ICR7Y2hlY2tSZXN1bHQuY29uZmlkZW5jZS50b0ZpeGVkKDMpfSwgcmVxdWlyZWQ6ICR7Y2hlY2tSZXN1bHQucmVxdWlyZWRDb25maWRlbmNlLnRvRml4ZWQoMyl9YCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBWYWxpZCByZXN1bHRcclxuICAgICAgICAgICAgICAgIGZvcm1hdHRlZFJlc3VsdCA9IGAxJHtkaWNlVHlwZX0oJHtjaGVja1Jlc3VsdC5yZXN1bHR9KSA9ICR7Y2hlY2tSZXN1bHQucmVzdWx0fWA7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+TiiBTaW5nbGUgZGljZSByb2xsIHJlc3VsdDogJHtmb3JtYXR0ZWRSZXN1bHR9YCk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRoaXMuaXNSb2xsaW5nID0gZmFsc2U7XHJcblxyXG4gICAgICAgICAgICAvLyBUcmlnZ2VyIHRoZSBvblJvbGxDb21wbGV0ZSBjYWxsYmFjayB3aXRoIGZvcm1hdHRlZCByZXN1bHRcclxuICAgICAgICAgICAgaWYgKHRoaXMub25Sb2xsQ29tcGxldGUpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMub25Sb2xsQ29tcGxldGUoZm9ybWF0dGVkUmVzdWx0KTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0sIDIwMDApO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY2hlY2tNdWx0aURpY2VTZXR0bGluZygpOiB2b2lkIHtcclxuICAgICAgICBpZiAoIXRoaXMuaXNSb2xsaW5nKSByZXR1cm47XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGlmIGFsbCBkaWNlIGhhdmUgc2V0dGxlZFxyXG4gICAgICAgIGxldCBhbGxTZXR0bGVkID0gdHJ1ZTtcclxuICAgICAgICBjb25zdCBtb3Rpb25UaHJlc2hvbGQgPSB0aGlzLnNldHRpbmdzLm1vdGlvblRocmVzaG9sZDtcclxuICAgICAgICBjb25zdCB2ZWxvY2l0eVRocmVzaG9sZCA9IDAuMDUgLyBtb3Rpb25UaHJlc2hvbGQ7XHJcbiAgICAgICAgY29uc3QgYW5ndWxhclRocmVzaG9sZCA9IDAuNSAvIG1vdGlvblRocmVzaG9sZDtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmRpY2VCb2R5QXJyYXkubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgYm9keSA9IHRoaXMuZGljZUJvZHlBcnJheVtpXTtcclxuICAgICAgICAgICAgY29uc3QgdmVsb2NpdHkgPSBib2R5LnZlbG9jaXR5Lmxlbmd0aCgpO1xyXG4gICAgICAgICAgICBjb25zdCBhbmd1bGFyVmVsb2NpdHkgPSBib2R5LmFuZ3VsYXJWZWxvY2l0eS5sZW5ndGgoKTtcclxuXHJcbiAgICAgICAgICAgIGlmICh2ZWxvY2l0eSA+IHZlbG9jaXR5VGhyZXNob2xkIHx8IGFuZ3VsYXJWZWxvY2l0eSA+IGFuZ3VsYXJUaHJlc2hvbGQgfHwgYm9keS5wb3NpdGlvbi55ID4gLTAuNSkge1xyXG4gICAgICAgICAgICAgICAgYWxsU2V0dGxlZCA9IGZhbHNlO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIERlYnVnIGxvZ2dpbmcgKG9ubHkgZm9yIGZpcnN0IGZldyBjaGVja3MgdG8gYXZvaWQgc3BhbSlcclxuICAgICAgICAgICAgICAgIGlmIChNYXRoLnJhbmRvbSgpIDwgMC4wMikgeyAvLyBMb2cgMiUgb2YgdGhlIHRpbWVcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgRGljZSAke2l9IG5vdCBzZXR0bGVkOmAsIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdmVsb2NpdHk6IHZlbG9jaXR5LnRvRml4ZWQoMyksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFuZ3VsYXJWZWxvY2l0eTogYW5ndWxhclZlbG9jaXR5LnRvRml4ZWQoMyksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHBvc2l0aW9uWTogYm9keS5wb3NpdGlvbi55LnRvRml4ZWQoMyksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZlbG9jaXR5VGhyZXNob2xkOiB2ZWxvY2l0eVRocmVzaG9sZC50b0ZpeGVkKDMpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBhbmd1bGFyVGhyZXNob2xkOiBhbmd1bGFyVGhyZXNob2xkLnRvRml4ZWQoMyksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHZlbG9jaXR5T0s6IHZlbG9jaXR5IDw9IHZlbG9jaXR5VGhyZXNob2xkLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBhbmd1bGFyT0s6IGFuZ3VsYXJWZWxvY2l0eSA8PSBhbmd1bGFyVGhyZXNob2xkLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwb3NpdGlvbk9LOiBib2R5LnBvc2l0aW9uLnkgPD0gLTAuNVxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChhbGxTZXR0bGVkKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCfwn46yIEFsbCBkaWNlIG1vdGlvbiB0aHJlc2hvbGRzIG1ldCAtIGNvbXBsZXRpbmcgcm9sbCcpO1xyXG4gICAgICAgICAgICAvLyBDb21wbGV0ZSB0aGUgcm9sbCBpbW1lZGlhdGVseSBvbmNlIHNldHRsZWRcclxuICAgICAgICAgICAgdGhpcy5jb21wbGV0ZU11bHRpUm9sbCgpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIENoZWNrIGFnYWluIGluIDEwMG1zXHJcbiAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy5jaGVja011bHRpRGljZVNldHRsaW5nKCksIDEwMCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY29tcGxldGVNdWx0aVJvbGwoKTogdm9pZCB7XHJcbiAgICAgICAgLy8gQ2xlYXIgdGltZW91dCBpZiBpdCBleGlzdHNcclxuICAgICAgICBpZiAodGhpcy5yb2xsVGltZW91dElkKSB7XHJcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnJvbGxUaW1lb3V0SWQpO1xyXG4gICAgICAgICAgICB0aGlzLnJvbGxUaW1lb3V0SWQgPSBudWxsO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coJ+KchSBBbGwgZGljZSBzZXR0bGVkIC0gY2FsY3VsYXRpbmcgcmVzdWx0cycpO1xyXG5cclxuICAgICAgICAvLyBDYWxjdWxhdGUgcmVzdWx0cyBmb3IgYWxsIGRpY2UgdXNpbmcgcGh5c2ljcy1iYXNlZCBmYWNlIGRldGVjdGlvblxyXG4gICAgICAgIGNvbnN0IHJlc3VsdHM6IHsgW2tleTogc3RyaW5nXTogbnVtYmVyW10gfSA9IHt9O1xyXG4gICAgICAgIGxldCB0b3RhbFN1bSA9IDA7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5kaWNlQXJyYXkubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgZGljZVR5cGUgPSB0aGlzLmRpY2VUeXBlQXJyYXlbaV07XHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IHRoaXMuZ2V0VG9wRmFjZU51bWJlckZvckRpY2UoaSk7XHJcblxyXG4gICAgICAgICAgICBpZiAoIXJlc3VsdHNbZGljZVR5cGVdKSB7XHJcbiAgICAgICAgICAgICAgICByZXN1bHRzW2RpY2VUeXBlXSA9IFtdO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJlc3VsdHNbZGljZVR5cGVdLnB1c2gocmVzdWx0KTtcclxuICAgICAgICAgICAgdG90YWxTdW0gKz0gcmVzdWx0O1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gRm9ybWF0IHRoZSByZXN1bHQgc3RyaW5nXHJcbiAgICAgICAgY29uc3QgZm9ybWF0dGVkUmVzdWx0ID0gdGhpcy5mb3JtYXRSb2xsUmVzdWx0cyhyZXN1bHRzLCB0b3RhbFN1bSk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYPCfk4ogRmluYWwgcm9sbCByZXN1bHQ6ICR7Zm9ybWF0dGVkUmVzdWx0fWApO1xyXG5cclxuICAgICAgICB0aGlzLmlzUm9sbGluZyA9IGZhbHNlO1xyXG4gICAgICAgIGlmICh0aGlzLnJvbGxUaW1lb3V0KSB7XHJcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnJvbGxUaW1lb3V0KTtcclxuICAgICAgICAgICAgdGhpcy5yb2xsVGltZW91dCA9IG51bGw7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBBbHNvIHRyaWdnZXIgdGhlIG9uUm9sbENvbXBsZXRlIGNhbGxiYWNrIHdpdGggZm9ybWF0dGVkIHJlc3VsdFxyXG4gICAgICAgIGlmICh0aGlzLm9uUm9sbENvbXBsZXRlKSB7XHJcbiAgICAgICAgICAgIHRoaXMub25Sb2xsQ29tcGxldGUoZm9ybWF0dGVkUmVzdWx0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLm11bHRpUm9sbFJlc29sdmUpIHtcclxuICAgICAgICAgICAgdGhpcy5tdWx0aVJvbGxSZXNvbHZlKGZvcm1hdHRlZFJlc3VsdCk7XHJcbiAgICAgICAgICAgIHRoaXMubXVsdGlSb2xsUmVzb2x2ZSA9IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZm9yY2VTdG9wTXVsdGlSb2xsKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCfij7AgRm9yY2Ugc3RvcHBpbmcgbXVsdGktZGljZSByb2xsIGR1ZSB0byB0aW1lb3V0Jyk7XHJcbiAgICAgICAgdGhpcy5jb21wbGV0ZU11bHRpUm9sbCgpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIENoZWNrIGlmIGRpY2UgY2FuIGJlIGRldGVybWluZWQsIG9yIGlmIGl0J3MgY2F1Z2h0XHJcbiAgICBwcml2YXRlIGNoZWNrRGljZVJlc3VsdChkaWNlSW5kZXg6IG51bWJlcik6IHsgaXNDYXVnaHQ6IGJvb2xlYW47IHJlc3VsdDogbnVtYmVyIHwgbnVsbDsgY29uZmlkZW5jZTogbnVtYmVyOyByZXF1aXJlZENvbmZpZGVuY2U6IG51bWJlciB9IHtcclxuICAgICAgICBjb25zdCBkaWNlVHlwZSA9IHRoaXMuZGljZVR5cGVBcnJheVtkaWNlSW5kZXhdO1xyXG4gICAgICAgIGNvbnN0IGRpY2VNZXNoID0gdGhpcy5kaWNlQXJyYXlbZGljZUluZGV4XTtcclxuXHJcbiAgICAgICAgaWYgKCFkaWNlTWVzaCkge1xyXG4gICAgICAgICAgICByZXR1cm4geyBpc0NhdWdodDogZmFsc2UsIHJlc3VsdDogdGhpcy5nZXRSYW5kb21SZXN1bHRGb3JEaWNlVHlwZShkaWNlVHlwZSksIGNvbmZpZGVuY2U6IDAsIHJlcXVpcmVkQ29uZmlkZW5jZTogMCB9O1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gR2V0IGZhY2Ugbm9ybWFscyBmb3IgdGhpcyBkaWNlIHR5cGVcclxuICAgICAgICBjb25zdCBmYWNlTm9ybWFscyA9IHRoaXMuZ2V0RmFjZU5vcm1hbHNGb3JEaWNlVHlwZShkaWNlVHlwZSk7XHJcblxyXG4gICAgICAgIC8vIERldGVjdGlvbiB2ZWN0b3IgYmFzZWQgb24gZGljZSB0eXBlXHJcbiAgICAgICAgY29uc3QgZGV0ZWN0aW9uVmVjdG9yID0gZGljZVR5cGUgPT09ICdkNCdcclxuICAgICAgICAgICAgPyBuZXcgVEhSRUUuVmVjdG9yMygwLCAtMSwgMCkgIC8vIERvd24gdmVjdG9yIGZvciBENFxyXG4gICAgICAgICAgICA6IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDEsIDApOyAgIC8vIFVwIHZlY3RvciBmb3Igb3RoZXJzXHJcblxyXG4gICAgICAgIGxldCBiZXN0RG90UHJvZHVjdCA9IC1JbmZpbml0eTtcclxuICAgICAgICBsZXQgYmVzdEZhY2VJbmRleCA9IDA7XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGVhY2ggZmFjZSBub3JtYWwgdG8gZmluZCB3aGljaCBmYWNlIGlzIHBvaW50aW5nIHVwL2Rvd25cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZhY2VOb3JtYWxzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgIC8vIFRyYW5zZm9ybSBmYWNlIG5vcm1hbCB0byB3b3JsZCBzcGFjZSB1c2luZyBkaWNlIHJvdGF0aW9uXHJcbiAgICAgICAgICAgIGNvbnN0IHdvcmxkTm9ybWFsID0gZmFjZU5vcm1hbHNbaV0uY2xvbmUoKTtcclxuICAgICAgICAgICAgd29ybGROb3JtYWwuYXBwbHlRdWF0ZXJuaW9uKGRpY2VNZXNoLnF1YXRlcm5pb24pO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIGRvdCBwcm9kdWN0IHdpdGggZGV0ZWN0aW9uIHZlY3RvclxyXG4gICAgICAgICAgICBjb25zdCBkb3RQcm9kdWN0ID0gd29ybGROb3JtYWwuZG90KGRldGVjdGlvblZlY3Rvcik7XHJcblxyXG4gICAgICAgICAgICBpZiAoZG90UHJvZHVjdCA+IGJlc3REb3RQcm9kdWN0KSB7XHJcbiAgICAgICAgICAgICAgICBiZXN0RG90UHJvZHVjdCA9IGRvdFByb2R1Y3Q7XHJcbiAgICAgICAgICAgICAgICBiZXN0RmFjZUluZGV4ID0gaTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIGJlc3QgZmFjZSBtZWV0cyB0aGUgY29uZmlkZW5jZSB0aHJlc2hvbGRcclxuICAgICAgICBjb25zdCBtaW5Db25maWRlbmNlRm9yVmFsaWRGYWNlID0gMS4wIC0gdGhpcy5zZXR0aW5ncy5mYWNlRGV0ZWN0aW9uVG9sZXJhbmNlO1xyXG4gICAgICAgIGNvbnN0IGlzQ2F1Z2h0ID0gYmVzdERvdFByb2R1Y3QgPCBtaW5Db25maWRlbmNlRm9yVmFsaWRGYWNlO1xyXG5cclxuICAgICAgICBpZiAoaXNDYXVnaHQpIHtcclxuICAgICAgICAgICAgLy8gRmFjZSBkZXRlY3Rpb24gZmFpbGVkIC0gZGljZSBpcyBjYXVnaHRcclxuICAgICAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgICAgIGlzQ2F1Z2h0OiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgcmVzdWx0OiBudWxsLFxyXG4gICAgICAgICAgICAgICAgY29uZmlkZW5jZTogYmVzdERvdFByb2R1Y3QsXHJcbiAgICAgICAgICAgICAgICByZXF1aXJlZENvbmZpZGVuY2U6IG1pbkNvbmZpZGVuY2VGb3JWYWxpZEZhY2VcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBGYWNlIGRldGVjdGlvbiBzdWNjZWVkZWQgLSByZXR1cm4gdGhlIHJlc3VsdFxyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSB0aGlzLm1hcEZhY2VJbmRleFRvTnVtYmVyKGJlc3RGYWNlSW5kZXgsIGRpY2VUeXBlKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYPCfjq8gRGljZSAke2RpY2VJbmRleH0gKCR7ZGljZVR5cGV9KSBmYWNlIGRldGVjdGlvbjogZmFjZSBpbmRleCAke2Jlc3RGYWNlSW5kZXh9ID0gJHtyZXN1bHR9LCBjb25maWRlbmNlOiAke2Jlc3REb3RQcm9kdWN0LnRvRml4ZWQoMyl9YCk7XHJcbiAgICAgICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgICAgICBpc0NhdWdodDogZmFsc2UsXHJcbiAgICAgICAgICAgICAgICByZXN1bHQ6IHJlc3VsdCxcclxuICAgICAgICAgICAgICAgIGNvbmZpZGVuY2U6IGJlc3REb3RQcm9kdWN0LFxyXG4gICAgICAgICAgICAgICAgcmVxdWlyZWRDb25maWRlbmNlOiBtaW5Db25maWRlbmNlRm9yVmFsaWRGYWNlXHJcbiAgICAgICAgICAgIH07XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2V0VG9wRmFjZU51bWJlckZvckRpY2UoZGljZUluZGV4OiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgICAgIC8vIFVzZSB0aGUgdW5pZmllZCBjaGVja0RpY2VSZXN1bHQgbWV0aG9kIHRvIHBlcmZvcm0gZmFjZSBkZXRlY3Rpb25cclxuICAgICAgICBjb25zdCBjaGVja1Jlc3VsdCA9IHRoaXMuY2hlY2tEaWNlUmVzdWx0KGRpY2VJbmRleCk7XHJcblxyXG4gICAgICAgIC8vIEp1c3QgcmV0dXJuIHRoZSByZXN1bHQgKG9yIGZhbGxiYWNrIGlmIGNhdWdodClcclxuICAgICAgICAvLyBOb3RlOiBDYXVnaHQgY2hlY2tpbmcvaGlnaGxpZ2h0aW5nIGlzIGhhbmRsZWQgc2VwYXJhdGVseSBpbiBtb25pdG9yaW5nIGNvZGVcclxuICAgICAgICBpZiAoY2hlY2tSZXN1bHQuaXNDYXVnaHQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0UmFuZG9tUmVzdWx0Rm9yRGljZVR5cGUodGhpcy5kaWNlVHlwZUFycmF5W2RpY2VJbmRleF0pO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIGNoZWNrUmVzdWx0LnJlc3VsdCE7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRGYWNlTm9ybWFsc0ZvckRpY2VUeXBlKGRpY2VUeXBlOiBzdHJpbmcpOiBUSFJFRS5WZWN0b3IzW10ge1xyXG4gICAgICAgIHN3aXRjaCAoZGljZVR5cGUpIHtcclxuICAgICAgICAgICAgY2FzZSAnZDQnOlxyXG4gICAgICAgICAgICAgICAgLy8gVEhSRUUuanMgVGV0cmFoZWRyb25HZW9tZXRyeSBjcmVhdGVzIGEgcmVndWxhciB0ZXRyYWhlZHJvbiB3aXRoIHZlcnRpY2VzOlxyXG4gICAgICAgICAgICAgICAgLy8gdjA6ICgxLCAxLCAxKSwgdjE6ICgtMSwgLTEsIDEpLCB2MjogKC0xLCAxLCAtMSksIHYzOiAoMSwgLTEsIC0xKVxyXG4gICAgICAgICAgICAgICAgLy8gQ2VudGVyIGlzIGF0ICgwLCAwLCAwKVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIFRoZSBhY3R1YWwgZmFjZSBzdHJ1Y3R1cmUgZnJvbSBUSFJFRS5qcyBUZXRyYWhlZHJvbkdlb21ldHJ5OlxyXG4gICAgICAgICAgICAgICAgLy8gTG9va2luZyBhdCB0aGUgc291cmNlLCBmYWNlcyBhcmUgY3JlYXRlZCBhczpcclxuICAgICAgICAgICAgICAgIC8vIEZhY2UgMDogKDIsIDMsIDApIC0gY29udGFpbnMgdmVydGljZXMgdjIsIHYzLCB2MFxyXG4gICAgICAgICAgICAgICAgLy8gRmFjZSAxOiAoMCwgMywgMSkgLSBjb250YWlucyB2ZXJ0aWNlcyB2MCwgdjMsIHYxXHJcbiAgICAgICAgICAgICAgICAvLyBGYWNlIDI6ICgxLCAzLCAyKSAtIGNvbnRhaW5zIHZlcnRpY2VzIHYxLCB2MywgdjJcclxuICAgICAgICAgICAgICAgIC8vIEZhY2UgMzogKDIsIDAsIDEpIC0gY29udGFpbnMgdmVydGljZXMgdjIsIHYwLCB2MVxyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IHYwID0gbmV3IFRIUkVFLlZlY3RvcjMoMSwgMSwgMSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB2MSA9IG5ldyBUSFJFRS5WZWN0b3IzKC0xLCAtMSwgMSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB2MiA9IG5ldyBUSFJFRS5WZWN0b3IzKC0xLCAxLCAtMSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB2MyA9IG5ldyBUSFJFRS5WZWN0b3IzKDEsIC0xLCAtMSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIGZhY2UgY2VudGVycyB0byBlbnN1cmUgbm9ybWFscyBwb2ludCBvdXR3YXJkXHJcbiAgICAgICAgICAgICAgICBjb25zdCBjZW50ZXIgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAwKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBGYWNlIDA6IHZlcnRpY2VzIDIsIDMsIDBcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZhY2UwQ2VudGVyID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5hZGRWZWN0b3JzKHYyLCB2MykuYWRkKHYwKS5kaXZpZGVTY2FsYXIoMyk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBlMF8xID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5zdWJWZWN0b3JzKHYzLCB2Mik7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBlMF8yID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5zdWJWZWN0b3JzKHYwLCB2Mik7XHJcbiAgICAgICAgICAgICAgICBsZXQgbjAgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNyb3NzVmVjdG9ycyhlMF8xLCBlMF8yKS5ub3JtYWxpemUoKTtcclxuICAgICAgICAgICAgICAgIC8vIEVuc3VyZSBub3JtYWwgcG9pbnRzIG91dHdhcmRcclxuICAgICAgICAgICAgICAgIGlmIChuMC5kb3QoZmFjZTBDZW50ZXIuY2xvbmUoKS5zdWIoY2VudGVyKSkgPCAwKSBuMC5uZWdhdGUoKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBGYWNlIDE6IHZlcnRpY2VzIDAsIDMsIDFcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZhY2UxQ2VudGVyID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5hZGRWZWN0b3JzKHYwLCB2MykuYWRkKHYxKS5kaXZpZGVTY2FsYXIoMyk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBlMV8xID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5zdWJWZWN0b3JzKHYzLCB2MCk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBlMV8yID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5zdWJWZWN0b3JzKHYxLCB2MCk7XHJcbiAgICAgICAgICAgICAgICBsZXQgbjEgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNyb3NzVmVjdG9ycyhlMV8xLCBlMV8yKS5ub3JtYWxpemUoKTtcclxuICAgICAgICAgICAgICAgIGlmIChuMS5kb3QoZmFjZTFDZW50ZXIuY2xvbmUoKS5zdWIoY2VudGVyKSkgPCAwKSBuMS5uZWdhdGUoKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBGYWNlIDI6IHZlcnRpY2VzIDEsIDMsIDJcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZhY2UyQ2VudGVyID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5hZGRWZWN0b3JzKHYxLCB2MykuYWRkKHYyKS5kaXZpZGVTY2FsYXIoMyk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBlMl8xID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5zdWJWZWN0b3JzKHYzLCB2MSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBlMl8yID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5zdWJWZWN0b3JzKHYyLCB2MSk7XHJcbiAgICAgICAgICAgICAgICBsZXQgbjIgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNyb3NzVmVjdG9ycyhlMl8xLCBlMl8yKS5ub3JtYWxpemUoKTtcclxuICAgICAgICAgICAgICAgIGlmIChuMi5kb3QoZmFjZTJDZW50ZXIuY2xvbmUoKS5zdWIoY2VudGVyKSkgPCAwKSBuMi5uZWdhdGUoKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBGYWNlIDM6IHZlcnRpY2VzIDIsIDAsIDFcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZhY2UzQ2VudGVyID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5hZGRWZWN0b3JzKHYyLCB2MCkuYWRkKHYxKS5kaXZpZGVTY2FsYXIoMyk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBlM18xID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5zdWJWZWN0b3JzKHYwLCB2Mik7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBlM18yID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5zdWJWZWN0b3JzKHYxLCB2Mik7XHJcbiAgICAgICAgICAgICAgICBsZXQgbjMgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNyb3NzVmVjdG9ycyhlM18xLCBlM18yKS5ub3JtYWxpemUoKTtcclxuICAgICAgICAgICAgICAgIGlmIChuMy5kb3QoZmFjZTNDZW50ZXIuY2xvbmUoKS5zdWIoY2VudGVyKSkgPCAwKSBuMy5uZWdhdGUoKTtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnRDQgRmFjZSBub3JtYWxzIGNhbGN1bGF0ZWQ6Jyk7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICBGYWNlIDAgKHZhbHVlIDEpOiAoJHtuMC54LnRvRml4ZWQoMyl9LCAke24wLnkudG9GaXhlZCgzKX0sICR7bjAuei50b0ZpeGVkKDMpfSlgKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgIEZhY2UgMSAodmFsdWUgMik6ICgke24xLngudG9GaXhlZCgzKX0sICR7bjEueS50b0ZpeGVkKDMpfSwgJHtuMS56LnRvRml4ZWQoMyl9KWApO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCAgRmFjZSAyICh2YWx1ZSAzKTogKCR7bjIueC50b0ZpeGVkKDMpfSwgJHtuMi55LnRvRml4ZWQoMyl9LCAke24yLnoudG9GaXhlZCgzKX0pYCk7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgICBGYWNlIDMgKHZhbHVlIDQpOiAoJHtuMy54LnRvRml4ZWQoMyl9LCAke24zLnkudG9GaXhlZCgzKX0sICR7bjMuei50b0ZpeGVkKDMpfSlgKTtcclxuXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gW24wLCBuMSwgbjIsIG4zXTtcclxuXHJcbiAgICAgICAgICAgIGNhc2UgJ2Q2JzpcclxuICAgICAgICAgICAgICAgIC8vIEJveC9DdWJlIGZhY2Ugbm9ybWFsc1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMygxLCAwLCAwKSwgICAvLyBSaWdodFxyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKC0xLCAwLCAwKSwgIC8vIExlZnRcclxuICAgICAgICAgICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMygwLCAxLCAwKSwgICAvLyBUb3BcclxuICAgICAgICAgICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMygwLCAtMSwgMCksICAvLyBCb3R0b21cclxuICAgICAgICAgICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAxKSwgICAvLyBGcm9udFxyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKDAsIDAsIC0xKSAgIC8vIEJhY2tcclxuICAgICAgICAgICAgICAgIF07XHJcblxyXG4gICAgICAgICAgICBjYXNlICdkOCc6XHJcbiAgICAgICAgICAgICAgICAvLyBPY3RhaGVkcm9uIGZhY2Ugbm9ybWFsc1xyXG4gICAgICAgICAgICAgICAgY29uc3Qgb2N0ID0gMSAvIE1hdGguc3FydCgzKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMob2N0LCBvY3QsIG9jdCksXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMoLW9jdCwgb2N0LCBvY3QpLFxyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKC1vY3QsIC1vY3QsIG9jdCksXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMob2N0LCAtb2N0LCBvY3QpLFxyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKG9jdCwgb2N0LCAtb2N0KSxcclxuICAgICAgICAgICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMygtb2N0LCBvY3QsIC1vY3QpLFxyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKC1vY3QsIC1vY3QsIC1vY3QpLFxyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKG9jdCwgLW9jdCwgLW9jdClcclxuICAgICAgICAgICAgICAgIF07XHJcblxyXG4gICAgICAgICAgICBjYXNlICdkMTAnOlxyXG4gICAgICAgICAgICAgICAgLy8gRDEwIGZhY2Ugbm9ybWFscyAoa2l0ZS1zaGFwZWQgZmFjZXMpXHJcbiAgICAgICAgICAgICAgICBjb25zdCBub3JtYWxzOiBUSFJFRS5WZWN0b3IzW10gPSBbXTtcclxuICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgMTA7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGFuZ2xlID0gKGkgKiAyICogTWF0aC5QSSAvIDEwKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBub3JtYWwgPSBuZXcgVEhSRUUuVmVjdG9yMyhcclxuICAgICAgICAgICAgICAgICAgICAgICAgTWF0aC5jb3MoYW5nbGUpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAwLjMsIC8vIFNsaWdodCB1cHdhcmQgYW5nbGVcclxuICAgICAgICAgICAgICAgICAgICAgICAgTWF0aC5zaW4oYW5nbGUpXHJcbiAgICAgICAgICAgICAgICAgICAgKS5ub3JtYWxpemUoKTtcclxuICAgICAgICAgICAgICAgICAgICBub3JtYWxzLnB1c2gobm9ybWFsKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBub3JtYWxzO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnZDEyJzpcclxuICAgICAgICAgICAgICAgIC8vIERvZGVjYWhlZHJvbiBmYWNlIG5vcm1hbHMgKDEyIHBlbnRhZ29uYWwgZmFjZXMpXHJcbiAgICAgICAgICAgICAgICBjb25zdCBwaGkgPSAoMSArIE1hdGguc3FydCg1KSkgLyAyO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgaW52UGhpID0gMSAvIHBoaTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBbXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMoMCwgcGhpLCBpbnZQaGkpLm5vcm1hbGl6ZSgpLFxyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKGludlBoaSwgcGhpLCAwKS5ub3JtYWxpemUoKSxcclxuICAgICAgICAgICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMyhpbnZQaGksIDAsIHBoaSkubm9ybWFsaXplKCksXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMoLWludlBoaSwgMCwgcGhpKS5ub3JtYWxpemUoKSxcclxuICAgICAgICAgICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMygtaW52UGhpLCBwaGksIDApLm5vcm1hbGl6ZSgpLFxyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKDAsIGludlBoaSwgcGhpKS5ub3JtYWxpemUoKSxcclxuICAgICAgICAgICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMygwLCBwaGksIC1pbnZQaGkpLm5vcm1hbGl6ZSgpLFxyXG4gICAgICAgICAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKGludlBoaSwgMCwgLXBoaSkubm9ybWFsaXplKCksXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMoMCwgLWludlBoaSwgLXBoaSkubm9ybWFsaXplKCksXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMoMCwgLXBoaSwgLWludlBoaSkubm9ybWFsaXplKCksXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMoLWludlBoaSwgMCwgLXBoaSkubm9ybWFsaXplKCksXHJcbiAgICAgICAgICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMoMCwgLXBoaSwgaW52UGhpKS5ub3JtYWxpemUoKVxyXG4gICAgICAgICAgICAgICAgXTtcclxuXHJcbiAgICAgICAgICAgIGNhc2UgJ2QyMCc6XHJcbiAgICAgICAgICAgICAgICAvLyBJY29zYWhlZHJvbiBmYWNlIG5vcm1hbHMgKDIwIHRyaWFuZ3VsYXIgZmFjZXMpXHJcbiAgICAgICAgICAgICAgICBjb25zdCB0ID0gKDEgKyBNYXRoLnNxcnQoNSkpIC8gMjtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHZlcnRpY2VzID0gW1xyXG4gICAgICAgICAgICAgICAgICAgIFstMSwgdCwgMF0sIFsxLCB0LCAwXSwgWy0xLCAtdCwgMF0sIFsxLCAtdCwgMF0sXHJcbiAgICAgICAgICAgICAgICAgICAgWzAsIC0xLCB0XSwgWzAsIDEsIHRdLCBbMCwgLTEsIC10XSwgWzAsIDEsIC10XSxcclxuICAgICAgICAgICAgICAgICAgICBbdCwgMCwgLTFdLCBbdCwgMCwgMV0sIFstdCwgMCwgLTFdLCBbLXQsIDAsIDFdXHJcbiAgICAgICAgICAgICAgICBdO1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IGZhY2VzID0gW1xyXG4gICAgICAgICAgICAgICAgICAgIFswLCAxMSwgNV0sIFswLCA1LCAxXSwgWzAsIDEsIDddLCBbMCwgNywgMTBdLCBbMCwgMTAsIDExXSxcclxuICAgICAgICAgICAgICAgICAgICBbMSwgNSwgOV0sIFs1LCAxMSwgNF0sIFsxMSwgMTAsIDJdLCBbMTAsIDcsIDZdLCBbNywgMSwgOF0sXHJcbiAgICAgICAgICAgICAgICAgICAgWzMsIDksIDRdLCBbMywgNCwgMl0sIFszLCAyLCA2XSwgWzMsIDYsIDhdLCBbMywgOCwgOV0sXHJcbiAgICAgICAgICAgICAgICAgICAgWzQsIDksIDVdLCBbMiwgNCwgMTFdLCBbNiwgMiwgMTBdLCBbOCwgNiwgN10sIFs5LCA4LCAxXVxyXG4gICAgICAgICAgICAgICAgXTtcclxuXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFjZXMubWFwKGZhY2UgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHYxID0gbmV3IFRIUkVFLlZlY3RvcjMoLi4udmVydGljZXNbZmFjZVswXV0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHYyID0gbmV3IFRIUkVFLlZlY3RvcjMoLi4udmVydGljZXNbZmFjZVsxXV0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHYzID0gbmV3IFRIUkVFLlZlY3RvcjMoLi4udmVydGljZXNbZmFjZVsyXV0pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBlZGdlMSA9IHYyLmNsb25lKCkuc3ViKHYxKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBlZGdlMiA9IHYzLmNsb25lKCkuc3ViKHYxKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZWRnZTEuY3Jvc3MoZWRnZTIpLm5vcm1hbGl6ZSgpO1xyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBVbmtub3duIGRpY2UgdHlwZSAke2RpY2VUeXBlfSwgdXNpbmcgZGVmYXVsdCBub3JtYWxzYCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gW25ldyBUSFJFRS5WZWN0b3IzKDAsIDEsIDApXTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBtYXBGYWNlSW5kZXhUb051bWJlcihmYWNlSW5kZXg6IG51bWJlciwgZGljZVR5cGU6IHN0cmluZyk6IG51bWJlciB7XHJcbiAgICAgICAgLy8gRm9yIG1vc3QgZGljZSwgZmFjZSBpbmRleCBkaXJlY3RseSBtYXBzIHRvIGZhY2UgbnVtYmVyXHJcbiAgICAgICAgLy8gU3BlY2lhbCBjYXNlcyBjYW4gYmUgaGFuZGxlZCBoZXJlXHJcbiAgICAgICAgc3dpdGNoIChkaWNlVHlwZSkge1xyXG4gICAgICAgICAgICBjYXNlICdkNCc6XHJcbiAgICAgICAgICAgICAgICAvLyBENCBtYXBwaW5nOiBmYWNlcyBhcmUgbnVtYmVyZWQgMS00XHJcbiAgICAgICAgICAgICAgICAvLyBUaGUgVVYgbWFwcGluZyBwdXRzIGZhY2VzIGluIGEgMngyIGdyaWQ6XHJcbiAgICAgICAgICAgICAgICAvLyBGYWNlIDAgKHRvcC1sZWZ0KSA9IDEsIEZhY2UgMSAodG9wLXJpZ2h0KSA9IDJcclxuICAgICAgICAgICAgICAgIC8vIEZhY2UgMiAoYm90dG9tLWxlZnQpID0gMywgRmFjZSAzIChib3R0b20tcmlnaHQpID0gNFxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhY2VJbmRleCArIDE7XHJcblxyXG4gICAgICAgICAgICBjYXNlICdkNic6XHJcbiAgICAgICAgICAgICAgICAvLyBTdGFuZGFyZCBkNiBmYWNlIG1hcHBpbmcgKDEtNilcclxuICAgICAgICAgICAgICAgIGNvbnN0IGQ2TWFwID0gWzQsIDMsIDUsIDIsIDEsIDZdOyAvLyBBZGp1c3QgYmFzZWQgb24gVVYgbGF5b3V0XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZDZNYXBbZmFjZUluZGV4XSB8fCAxO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnZDgnOlxyXG4gICAgICAgICAgICAgICAgLy8gRDggbWFwcGluZyB3aGVyZSBvcHBvc2l0ZSBmYWNlcyBzdW0gdG8gOVxyXG4gICAgICAgICAgICAgICAgLy8gT2N0YWhlZHJvbiBvcHBvc2l0ZSBwYWlycyBiYXNlZCBvbiBmYWNlIG5vcm1hbHM6XHJcbiAgICAgICAgICAgICAgICAvLyBJbmRleCAwICgrLCssKykg4oaUIEluZGV4IDYgKC0sLSwtKSDihpIgMSDihpQgOFxyXG4gICAgICAgICAgICAgICAgLy8gSW5kZXggMSAoLSwrLCspIOKGlCBJbmRleCA3ICgrLC0sLSkg4oaSIDIg4oaUIDdcclxuICAgICAgICAgICAgICAgIC8vIEluZGV4IDIgKC0sLSwrKSDihpQgSW5kZXggNCAoKywrLC0pIOKGkiAzIOKGlCA2XHJcbiAgICAgICAgICAgICAgICAvLyBJbmRleCAzICgrLC0sKykg4oaUIEluZGV4IDUgKC0sKywtKSDihpIgNCDihpQgNVxyXG4gICAgICAgICAgICAgICAgY29uc3QgZDhNYXAgPSBbMSwgMiwgMywgNCwgNiwgNSwgOCwgN107XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gZDhNYXBbZmFjZUluZGV4XSB8fCAxO1xyXG5cclxuICAgICAgICAgICAgY2FzZSAnZDEwJzpcclxuICAgICAgICAgICAgICAgIC8vIEQxMCB1c2VzIDAtOSBvciAwMC05MFxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhY2VJbmRleDsgLy8gMC05XHJcblxyXG4gICAgICAgICAgICBjYXNlICdkMjAnOlxyXG4gICAgICAgICAgICAgICAgLy8gU3RhbmRhcmQgaWNvc2FoZWRyb24gZmFjZSBtYXBwaW5nXHJcbiAgICAgICAgICAgICAgICByZXR1cm4gKGZhY2VJbmRleCAlIDIwKSArIDE7XHJcblxyXG4gICAgICAgICAgICBkZWZhdWx0OlxyXG4gICAgICAgICAgICAgICAgLy8gRGVmYXVsdDogZmFjZSBpbmRleCArIDEgZ2l2ZXMgZmFjZSBudW1iZXJcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWNlSW5kZXggKyAxO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGZvcm1hdFJvbGxSZXN1bHRzKHJlc3VsdHM6IHsgW2tleTogc3RyaW5nXTogbnVtYmVyW10gfSwgdG90YWxTdW06IG51bWJlcik6IHN0cmluZyB7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0UGFydHM6IHN0cmluZ1tdID0gW107XHJcblxyXG4gICAgICAgIC8vIFNvcnQgZGljZSB0eXBlcyBmb3IgY29uc2lzdGVudCBvdXRwdXRcclxuICAgICAgICBjb25zdCBzb3J0ZWRUeXBlcyA9IE9iamVjdC5rZXlzKHJlc3VsdHMpLnNvcnQoKGEsIGIpID0+IHtcclxuICAgICAgICAgICAgY29uc3Qgb3JkZXIgPSBbJ2Q0JywgJ2Q2JywgJ2Q4JywgJ2QxMCcsICdkMTInLCAnZDIwJ107XHJcbiAgICAgICAgICAgIHJldHVybiBvcmRlci5pbmRleE9mKGEpIC0gb3JkZXIuaW5kZXhPZihiKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBkaWNlVHlwZSBvZiBzb3J0ZWRUeXBlcykge1xyXG4gICAgICAgICAgICBjb25zdCByb2xscyA9IHJlc3VsdHNbZGljZVR5cGVdO1xyXG4gICAgICAgICAgICBjb25zdCByb2xsc1N0ciA9IHJvbGxzLmpvaW4oJysnKTtcclxuICAgICAgICAgICAgcmVzdWx0UGFydHMucHVzaChgJHtyb2xscy5sZW5ndGh9JHtkaWNlVHlwZX0oJHtyb2xsc1N0cn0pYCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gYCR7cmVzdWx0UGFydHMuam9pbignICsgJyl9ID0gJHt0b3RhbFN1bX1gO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgYW5pbWF0ZUFsbERpY2UoKTogdm9pZCB7XHJcbiAgICAgICAgLy8gU2ltcGxlIGFuaW1hdGlvbiAtIGp1c3Qgc3BpbiBhbGwgZGljZVxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5kaWNlQXJyYXkubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgZGljZSA9IHRoaXMuZGljZUFycmF5W2ldO1xyXG4gICAgICAgICAgICBjb25zdCBib2R5ID0gdGhpcy5kaWNlQm9keUFycmF5W2ldO1xyXG5cclxuICAgICAgICAgICAgLy8gQWRkIHJhbmRvbSByb3RhdGlvblxyXG4gICAgICAgICAgICBkaWNlLnJvdGF0aW9uLnggKz0gKE1hdGgucmFuZG9tKCkgLSAwLjUpICogMjtcclxuICAgICAgICAgICAgZGljZS5yb3RhdGlvbi55ICs9IChNYXRoLnJhbmRvbSgpIC0gMC41KSAqIDI7XHJcbiAgICAgICAgICAgIGRpY2Uucm90YXRpb24ueiArPSAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiAyO1xyXG5cclxuICAgICAgICAgICAgLy8gQWRkIHNtYWxsIHBoeXNpY3MgaW1wdWxzZSBmb3IgdmlzdWFsIGVmZmVjdFxyXG4gICAgICAgICAgICBib2R5LnZlbG9jaXR5LnNldChcclxuICAgICAgICAgICAgICAgIChNYXRoLnJhbmRvbSgpIC0gMC41KSAqIDIsXHJcbiAgICAgICAgICAgICAgICBNYXRoLnJhbmRvbSgpICogMixcclxuICAgICAgICAgICAgICAgIChNYXRoLnJhbmRvbSgpIC0gMC41KSAqIDJcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxuICAgIHByaXZhdGUgY3JlYXRlUGh5c2ljc0JvZHkoKTogdm9pZCB7XHJcbiAgICAgICAgLy8gRElTQUJMRUQ6IExlZ2FjeSBzaW5nbGUtZGljZSBwaHlzaWNzIGJvZHkgY3JlYXRpb25cclxuICAgICAgICAvLyBNdWx0aS1kaWNlIHN5c3RlbSB1c2VzIGNyZWF0ZVBoeXNpY3NCb2R5Rm9yRGljZVR5cGUoKSBpbnN0ZWFkXHJcbiAgICAgICAgY29uc29sZS5sb2coJ2NyZWF0ZVBoeXNpY3NCb2R5KCkgY2FsbGVkIGJ1dCBkaXNhYmxlZCBmb3IgbXVsdGktZGljZSBzeXN0ZW0nKTtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjcmVhdGVDb252ZXhQb2x5aGVkcm9uRnJvbUdlb21ldHJ5KGdlb21ldHJ5OiBUSFJFRS5CdWZmZXJHZW9tZXRyeSk6IENBTk5PTi5Db252ZXhQb2x5aGVkcm9uIHtcclxuICAgICAgICBjb25zdCB3b3JraW5nR2VvbWV0cnkgPSBnZW9tZXRyeS50b05vbkluZGV4ZWQoKTtcclxuICAgICAgICBjb25zdCBwb3NpdGlvbkF0dHJpYnV0ZSA9IHdvcmtpbmdHZW9tZXRyeS5hdHRyaWJ1dGVzLnBvc2l0aW9uO1xyXG5cclxuICAgICAgICBpZiAoIXBvc2l0aW9uQXR0cmlidXRlKSB7XHJcbiAgICAgICAgICAgIHdvcmtpbmdHZW9tZXRyeS5kaXNwb3NlKCk7XHJcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IGNyZWF0ZSBjb252ZXggcG9seWhlZHJvbjogbWlzc2luZyBwb3NpdGlvbiBhdHRyaWJ1dGUnKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IHZlcnRpY2VzOiBDQU5OT04uVmVjM1tdID0gW107XHJcbiAgICAgICAgY29uc3QgZmFjZXM6IG51bWJlcltdW10gPSBbXTtcclxuICAgICAgICBjb25zdCB2ZXJ0ZXhNYXAgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xyXG5cclxuICAgICAgICBjb25zdCBhZGRWZXJ0ZXggPSAodmVydGV4OiBUSFJFRS5WZWN0b3IzKTogbnVtYmVyID0+IHtcclxuICAgICAgICAgICAgY29uc3Qga2V5ID0gYCR7dmVydGV4LngudG9GaXhlZCg1KX18JHt2ZXJ0ZXgueS50b0ZpeGVkKDUpfXwke3ZlcnRleC56LnRvRml4ZWQoNSl9YDtcclxuICAgICAgICAgICAgbGV0IGluZGV4ID0gdmVydGV4TWFwLmdldChrZXkpO1xyXG4gICAgICAgICAgICBpZiAoaW5kZXggPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgaW5kZXggPSB2ZXJ0aWNlcy5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICB2ZXJ0aWNlcy5wdXNoKG5ldyBDQU5OT04uVmVjMyh2ZXJ0ZXgueCwgdmVydGV4LnksIHZlcnRleC56KSk7XHJcbiAgICAgICAgICAgICAgICB2ZXJ0ZXhNYXAuc2V0KGtleSwgaW5kZXgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIHJldHVybiBpbmRleDtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBvc2l0aW9uQXR0cmlidXRlLmNvdW50OyBpICs9IDMpIHtcclxuICAgICAgICAgICAgY29uc3QgZmFjZTogbnVtYmVyW10gPSBbXTtcclxuICAgICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCAzOyBqKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHZlcnRleCA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuZnJvbUJ1ZmZlckF0dHJpYnV0ZShwb3NpdGlvbkF0dHJpYnV0ZSwgaSArIGopO1xyXG4gICAgICAgICAgICAgICAgZmFjZS5wdXNoKGFkZFZlcnRleCh2ZXJ0ZXgpKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBmYWNlcy5wdXNoKGZhY2UpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgd29ya2luZ0dlb21ldHJ5LmRpc3Bvc2UoKTtcclxuXHJcbiAgICAgICAgY29uc3Qgc2hhcGUgPSBuZXcgQ0FOTk9OLkNvbnZleFBvbHloZWRyb24oeyB2ZXJ0aWNlcywgZmFjZXMgfSk7XHJcbiAgICAgICAgc2hhcGUuY29tcHV0ZU5vcm1hbHMoKTtcclxuICAgICAgICBzaGFwZS51cGRhdGVCb3VuZGluZ1NwaGVyZVJhZGl1cygpO1xyXG4gICAgICAgIHJldHVybiBzaGFwZTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGluaXRpYWxpemVGYWNlTnVtYmVycygpIHtcclxuICAgICAgICAvLyBJbml0aWFsaXplIGZhY2UgbnVtYmVycyBiYXNlZCBvbiBkaWNlIHR5cGVcclxuICAgICAgICBjb25zdCBmYWNlQ291bnQgPSB0aGlzLmdldEZhY2VDb3VudCgpO1xyXG4gICAgICAgIHRoaXMuZmFjZU51bWJlcnMgPSBbXTtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmYWNlQ291bnQ7IGkrKykge1xyXG4gICAgICAgICAgICB0aGlzLmZhY2VOdW1iZXJzLnB1c2goaSArIDEpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coYEluaXRpYWxpemVkICR7ZmFjZUNvdW50fSBmYWNlIG51bWJlcnMgZm9yICR7dGhpcy5zZXR0aW5ncy5kaWNlVHlwZX06YCwgdGhpcy5mYWNlTnVtYmVycyk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjYWxjdWxhdGVGYWNlTm9ybWFscygpIHtcclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+UjSBDYWxjdWxhdGluZyBmYWNlIG5vcm1hbHMgZm9yICR7dGhpcy5zZXR0aW5ncy5kaWNlVHlwZX0uLi5gKTtcclxuXHJcbiAgICAgICAgaWYgKCF0aGlzLmRpY2VHZW9tZXRyeSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdDYW5ub3QgY2FsY3VsYXRlIGZhY2Ugbm9ybWFsczogZGljZSBnZW9tZXRyeSBub3QgYXZhaWxhYmxlJyk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuZmFjZU5vcm1hbHMgPSBbXTtcclxuICAgICAgICBjb25zdCBwb3NpdGlvbkF0dHJpYnV0ZSA9IHRoaXMuZGljZUdlb21ldHJ5LmF0dHJpYnV0ZXMucG9zaXRpb247XHJcbiAgICAgICAgY29uc3QgZmFjZUNvdW50ID0gdGhpcy5nZXRGYWNlQ291bnQoKTtcclxuXHJcbiAgICAgICAgLy8gSGFuZGxlIGRpZmZlcmVudCBkaWNlIHR5cGVzXHJcbiAgICAgICAgc3dpdGNoICh0aGlzLnNldHRpbmdzLmRpY2VUeXBlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2Q2JzpcclxuICAgICAgICAgICAgICAgIC8vIEZvciBib3ggZ2VvbWV0cnksIHdlIG5lZWQgdG8gaGFuZGxlIHRoZSBmYWN0IHRoYXQgaXQgaGFzIDYgZmFjZXMgYnV0IDEyIHRyaWFuZ2xlc1xyXG4gICAgICAgICAgICAgICAgdGhpcy5jYWxjdWxhdGVCb3hGYWNlTm9ybWFscygpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlICdkMTAnOlxyXG4gICAgICAgICAgICAgICAgdGhpcy5jYWxjdWxhdGVEMTBGYWNlTm9ybWFscygpO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcblxyXG4gICAgICAgICAgICBjYXNlICdkMTInOlxyXG4gICAgICAgICAgICAgICAgLy8gRm9yIGRvZGVjYWhlZHJvbiwgdXNlIHRoZSBhY3R1YWwgMTIgcGVudGFnb25hbCBmYWNlIG5vcm1hbHNcclxuICAgICAgICAgICAgICAgIHRoaXMuY2FsY3VsYXRlRG9kZWNhaGVkcm9uRmFjZU5vcm1hbHMoKTtcclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG5cclxuICAgICAgICAgICAgZGVmYXVsdDpcclxuICAgICAgICAgICAgICAgIC8vIEZvciBvdGhlciBkaWNlIChkNCwgZDgsIGQyMCksIHVzZSB0cmlhbmdsZS1iYXNlZCBjYWxjdWxhdGlvblxyXG4gICAgICAgICAgICAgICAgY29uc3QgdHJpYW5nbGVDb3VudCA9IHBvc2l0aW9uQXR0cmlidXRlLmNvdW50IC8gMztcclxuXHJcbiAgICAgICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRyaWFuZ2xlQ291bnQ7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHZlcnRleEluZGV4ID0gaSAqIDM7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIEdldCB0aGUgdGhyZWUgdmVydGljZXMgb2YgdGhlIGZhY2VcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB2MSA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuZnJvbUJ1ZmZlckF0dHJpYnV0ZShwb3NpdGlvbkF0dHJpYnV0ZSwgdmVydGV4SW5kZXgpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHYyID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5mcm9tQnVmZmVyQXR0cmlidXRlKHBvc2l0aW9uQXR0cmlidXRlLCB2ZXJ0ZXhJbmRleCArIDEpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHYzID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5mcm9tQnVmZmVyQXR0cmlidXRlKHBvc2l0aW9uQXR0cmlidXRlLCB2ZXJ0ZXhJbmRleCArIDIpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyBDYWxjdWxhdGUgdHdvIGVkZ2UgdmVjdG9yc1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVkZ2UxID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5zdWJWZWN0b3JzKHYyLCB2MSk7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZWRnZTIgPSBuZXcgVEhSRUUuVmVjdG9yMygpLnN1YlZlY3RvcnModjMsIHYxKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIGZhY2Ugbm9ybWFsIHVzaW5nIGNyb3NzIHByb2R1Y3RcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBub3JtYWwgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNyb3NzVmVjdG9ycyhlZGdlMSwgZWRnZTIpLm5vcm1hbGl6ZSgpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmZhY2VOb3JtYWxzLnB1c2gobm9ybWFsKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coYOKchSBDYWxjdWxhdGVkICR7dGhpcy5mYWNlTm9ybWFscy5sZW5ndGh9IGZhY2Ugbm9ybWFscyBmb3IgJHt0aGlzLnNldHRpbmdzLmRpY2VUeXBlfWApO1xyXG5cclxuICAgICAgICAvLyBEZWJ1ZzogbG9nIHRoZSBmaXJzdCBmZXcgbm9ybWFsc1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgTWF0aC5taW4oNSwgdGhpcy5mYWNlTm9ybWFscy5sZW5ndGgpOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3Qgbm9ybWFsID0gdGhpcy5mYWNlTm9ybWFsc1tpXTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYEZhY2UgJHtpICsgMX0gbm9ybWFsOmAsIG5vcm1hbC54LnRvRml4ZWQoMyksIG5vcm1hbC55LnRvRml4ZWQoMyksIG5vcm1hbC56LnRvRml4ZWQoMykpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNhbGN1bGF0ZUJveEZhY2VOb3JtYWxzKCkge1xyXG4gICAgICAgIC8vIEJveCBoYXMgNiBmYWNlcyB3aXRoIHNwZWNpZmljIG5vcm1hbHNcclxuICAgICAgICB0aGlzLmZhY2VOb3JtYWxzID0gW1xyXG4gICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMygxLCAwLCAwKSwgICAvLyBSaWdodCBmYWNlXHJcbiAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKC0xLCAwLCAwKSwgIC8vIExlZnQgZmFjZVxyXG4gICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMygwLCAxLCAwKSwgICAvLyBUb3AgZmFjZVxyXG4gICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMygwLCAtMSwgMCksICAvLyBCb3R0b20gZmFjZVxyXG4gICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMygwLCAwLCAxKSwgICAvLyBGcm9udCBmYWNlXHJcbiAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKDAsIDAsIC0xKSAgIC8vIEJhY2sgZmFjZVxyXG4gICAgICAgIF07XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjYWxjdWxhdGVDeWxpbmRlckZhY2VOb3JtYWxzKCkge1xyXG4gICAgICAgIC8vIEZvciBkMTAsIGNyZWF0ZSBub3JtYWxzIGZvciAxMCBmYWNlcyBhcm91bmQgdGhlIGN5bGluZGVyXHJcbiAgICAgICAgdGhpcy5mYWNlTm9ybWFscyA9IFtdO1xyXG4gICAgICAgIGNvbnN0IGZhY2VDb3VudCA9IHRoaXMuZ2V0RmFjZUNvdW50KCk7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmFjZUNvdW50OyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgYW5nbGUgPSAoaSAqIDIgKiBNYXRoLlBJIC8gZmFjZUNvdW50KTtcclxuICAgICAgICAgICAgY29uc3Qgbm9ybWFsID0gbmV3IFRIUkVFLlZlY3RvcjMoXHJcbiAgICAgICAgICAgICAgICBNYXRoLmNvcyhhbmdsZSksXHJcbiAgICAgICAgICAgICAgICAwLjMsIC8vIFNsaWdodCB1cHdhcmQgYW5nbGUgZm9yIGQxMCBzaGFwZVxyXG4gICAgICAgICAgICAgICAgTWF0aC5zaW4oYW5nbGUpXHJcbiAgICAgICAgICAgICkubm9ybWFsaXplKCk7XHJcbiAgICAgICAgICAgIHRoaXMuZmFjZU5vcm1hbHMucHVzaChub3JtYWwpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNhbGN1bGF0ZURvZGVjYWhlZHJvbkZhY2VOb3JtYWxzKCkge1xyXG4gICAgICAgIC8vIEZvciBEMTIsIGNhbGN1bGF0ZSB0aGUgbm9ybWFscyBvZiB0aGUgMTIgYWN0dWFsIHBlbnRhZ29uYWwgZmFjZXNcclxuICAgICAgICAvLyBCYXNlZCBvbiB0aGUgcGh5c2ljcyBib2R5IGZhY2UgZGVmaW5pdGlvbnNcclxuICAgICAgICBjb25zdCBwaGkgPSAoMSArIE1hdGguc3FydCg1KSkgLyAyO1xyXG4gICAgICAgIGNvbnN0IGludlBoaSA9IDEgLyBwaGk7XHJcblxyXG4gICAgICAgIC8vIERlZmluZSB0aGUgMTIgcGVudGFnb24gZmFjZSBub3JtYWxzIGZvciBhIGRvZGVjYWhlZHJvblxyXG4gICAgICAgIHRoaXMuZmFjZU5vcm1hbHMgPSBbXHJcbiAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKDAsIHBoaSwgaW52UGhpKS5ub3JtYWxpemUoKSwgICAgIC8vIEZhY2UgMVxyXG4gICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMyhpbnZQaGksIHBoaSwgMCkubm9ybWFsaXplKCksICAgICAvLyBGYWNlIDJcclxuICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMoaW52UGhpLCAwLCBwaGkpLm5vcm1hbGl6ZSgpLCAgICAgLy8gRmFjZSAzXHJcbiAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKC1pbnZQaGksIDAsIHBoaSkubm9ybWFsaXplKCksICAgIC8vIEZhY2UgNFxyXG4gICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMygtaW52UGhpLCBwaGksIDApLm5vcm1hbGl6ZSgpLCAgICAvLyBGYWNlIDVcclxuICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMoMCwgaW52UGhpLCBwaGkpLm5vcm1hbGl6ZSgpLCAgICAgLy8gRmFjZSA2XHJcbiAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKDAsIHBoaSwgLWludlBoaSkubm9ybWFsaXplKCksICAgIC8vIEZhY2UgN1xyXG4gICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMyhpbnZQaGksIDAsIC1waGkpLm5vcm1hbGl6ZSgpLCAgICAvLyBGYWNlIDhcclxuICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMoMCwgLWludlBoaSwgLXBoaSkubm9ybWFsaXplKCksICAgLy8gRmFjZSA5XHJcbiAgICAgICAgICAgIG5ldyBUSFJFRS5WZWN0b3IzKDAsIC1waGksIC1pbnZQaGkpLm5vcm1hbGl6ZSgpLCAgIC8vIEZhY2UgMTBcclxuICAgICAgICAgICAgbmV3IFRIUkVFLlZlY3RvcjMoLWludlBoaSwgMCwgLXBoaSkubm9ybWFsaXplKCksICAgLy8gRmFjZSAxMVxyXG4gICAgICAgICAgICBuZXcgVEhSRUUuVmVjdG9yMygwLCAtcGhpLCBpbnZQaGkpLm5vcm1hbGl6ZSgpICAgICAvLyBGYWNlIDEyXHJcbiAgICAgICAgXTtcclxuICAgIH1cclxuICAgIHByaXZhdGUgY2FsY3VsYXRlRDEwRmFjZU5vcm1hbHMoKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRpY2VHZW9tZXRyeSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBwb3NpdGlvbkF0dHJpYnV0ZSA9IHRoaXMuZGljZUdlb21ldHJ5LmF0dHJpYnV0ZXMucG9zaXRpb247XHJcbiAgICAgICAgaWYgKCFwb3NpdGlvbkF0dHJpYnV0ZSkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmZhY2VOb3JtYWxzID0gW107XHJcblxyXG4gICAgICAgIC8vIEQxMCBoYXMgMTAgZmFjZXMsIGVhY2ggbWFkZSBvZiAyIHRyaWFuZ2xlcyAoMjAgdHJpYW5nbGVzIHRvdGFsKVxyXG4gICAgICAgIGNvbnN0IHRyaWFuZ2xlc1BlckZhY2UgPSAyO1xyXG4gICAgICAgIGNvbnN0IHRvdGFsVHJpYW5nbGVzID0gcG9zaXRpb25BdHRyaWJ1dGUuY291bnQgLyAzO1xyXG4gICAgICAgIGNvbnN0IHRvdGFsRmFjZXMgPSAxMDtcclxuXHJcbiAgICAgICAgZm9yIChsZXQgZmFjZUluZGV4ID0gMDsgZmFjZUluZGV4IDwgdG90YWxGYWNlczsgZmFjZUluZGV4KyspIHtcclxuICAgICAgICAgICAgY29uc3QgYmFzZVRyaWFuZ2xlID0gZmFjZUluZGV4ICogdHJpYW5nbGVzUGVyRmFjZTtcclxuICAgICAgICAgICAgaWYgKGJhc2VUcmlhbmdsZSA8IHRvdGFsVHJpYW5nbGVzKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB2ZXJ0ZXhPZmZzZXQgPSBiYXNlVHJpYW5nbGUgKiAzO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgdjEgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmZyb21CdWZmZXJBdHRyaWJ1dGUocG9zaXRpb25BdHRyaWJ1dGUsIHZlcnRleE9mZnNldCk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB2MiA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuZnJvbUJ1ZmZlckF0dHJpYnV0ZShwb3NpdGlvbkF0dHJpYnV0ZSwgdmVydGV4T2Zmc2V0ICsgMSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB2MyA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuZnJvbUJ1ZmZlckF0dHJpYnV0ZShwb3NpdGlvbkF0dHJpYnV0ZSwgdmVydGV4T2Zmc2V0ICsgMik7XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgZWRnZTEgPSBuZXcgVEhSRUUuVmVjdG9yMygpLnN1YlZlY3RvcnModjIsIHYxKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVkZ2UyID0gbmV3IFRIUkVFLlZlY3RvcjMoKS5zdWJWZWN0b3JzKHYzLCB2MSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBub3JtYWwgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNyb3NzVmVjdG9ycyhlZGdlMSwgZWRnZTIpLm5vcm1hbGl6ZSgpO1xyXG5cclxuICAgICAgICAgICAgICAgIHRoaXMuZmFjZU5vcm1hbHMucHVzaChub3JtYWwpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY2FsY3VsYXRlVHJhcGV6b2hlZHJvbkZhY2VOb3JtYWxzKCk6IHZvaWQge1xyXG4gICAgICAgIGlmICghdGhpcy5kaWNlR2VvbWV0cnkpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgcG9zaXRpb25BdHRyaWJ1dGUgPSB0aGlzLmRpY2VHZW9tZXRyeS5hdHRyaWJ1dGVzLnBvc2l0aW9uO1xyXG4gICAgICAgIGlmICghcG9zaXRpb25BdHRyaWJ1dGUpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5mYWNlTm9ybWFscyA9IFtdO1xyXG4gICAgICAgIGNvbnN0IHRyaWFuZ2xlc1BlckZhY2UgPSAyO1xyXG4gICAgICAgIGNvbnN0IHZlcnRpY2VzUGVyVHJpYW5nbGUgPSAzO1xyXG4gICAgICAgIGNvbnN0IGZhY2VWZXJ0ZXhTdHJpZGUgPSB0cmlhbmdsZXNQZXJGYWNlICogdmVydGljZXNQZXJUcmlhbmdsZTtcclxuICAgICAgICBjb25zdCB0b3RhbEZhY2VzID0gcG9zaXRpb25BdHRyaWJ1dGUuY291bnQgLyBmYWNlVmVydGV4U3RyaWRlO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBmYWNlSW5kZXggPSAwOyBmYWNlSW5kZXggPCB0b3RhbEZhY2VzOyBmYWNlSW5kZXgrKykge1xyXG4gICAgICAgICAgICBjb25zdCB2ZXJ0ZXhPZmZzZXQgPSBmYWNlSW5kZXggKiBmYWNlVmVydGV4U3RyaWRlO1xyXG4gICAgICAgICAgICBjb25zdCB2MSA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuZnJvbUJ1ZmZlckF0dHJpYnV0ZShwb3NpdGlvbkF0dHJpYnV0ZSwgdmVydGV4T2Zmc2V0KTtcclxuICAgICAgICAgICAgY29uc3QgdjIgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmZyb21CdWZmZXJBdHRyaWJ1dGUocG9zaXRpb25BdHRyaWJ1dGUsIHZlcnRleE9mZnNldCArIDEpO1xyXG4gICAgICAgICAgICBjb25zdCB2MyA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuZnJvbUJ1ZmZlckF0dHJpYnV0ZShwb3NpdGlvbkF0dHJpYnV0ZSwgdmVydGV4T2Zmc2V0ICsgMik7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBlZGdlMSA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuc3ViVmVjdG9ycyh2MiwgdjEpO1xyXG4gICAgICAgICAgICBjb25zdCBlZGdlMiA9IG5ldyBUSFJFRS5WZWN0b3IzKCkuc3ViVmVjdG9ycyh2MywgdjEpO1xyXG4gICAgICAgICAgICBjb25zdCBub3JtYWwgPSBuZXcgVEhSRUUuVmVjdG9yMygpLmNyb3NzVmVjdG9ycyhlZGdlMSwgZWRnZTIpLm5vcm1hbGl6ZSgpO1xyXG5cclxuICAgICAgICAgICAgdGhpcy5mYWNlTm9ybWFscy5wdXNoKG5vcm1hbCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuXHJcbiAgICBwcml2YXRlIGFkZERpY2VUZXh0dXJlcygpIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGljZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBUcnkgdG8gbG9hZCBjdXN0b20gdGV4dHVyZSBmb3IgY3VycmVudCBkaWNlIHR5cGVcclxuICAgICAgICBjb25zdCB0ZXh0dXJlRGF0YSA9IHRoaXMuZ2V0Q3VycmVudERpY2VUZXh0dXJlRGF0YSgpO1xyXG4gICAgICAgIGxldCBjdXN0b21UZXh0dXJlOiBUSFJFRS5UZXh0dXJlIHwgbnVsbCA9IG51bGw7XHJcblxyXG4gICAgICAgIGlmICh0ZXh0dXJlRGF0YSkge1xyXG4gICAgICAgICAgICBjdXN0b21UZXh0dXJlID0gdGhpcy5sb2FkQ3VzdG9tVGV4dHVyZSh0ZXh0dXJlRGF0YSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBUcnkgdG8gbG9hZCBub3JtYWwgbWFwIGZvciBjdXJyZW50IGRpY2UgdHlwZVxyXG4gICAgICAgIGNvbnN0IG5vcm1hbE1hcERhdGEgPSB0aGlzLmdldEN1cnJlbnREaWNlTm9ybWFsTWFwRGF0YSgpO1xyXG4gICAgICAgIGxldCBub3JtYWxNYXA6IFRIUkVFLlRleHR1cmUgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICAgICAgaWYgKG5vcm1hbE1hcERhdGEpIHtcclxuICAgICAgICAgICAgbm9ybWFsTWFwID0gdGhpcy5sb2FkTm9ybWFsTWFwKG5vcm1hbE1hcERhdGEpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIG1hdGVyaWFsIHdpdGggYWxsIGNvbmZpZ3VyYWJsZSBwcm9wZXJ0aWVzXHJcbiAgICAgICAgY29uc3QgbWF0ZXJpYWxQcm9wZXJ0aWVzOiBhbnkgPSB7XHJcbiAgICAgICAgICAgIGNvbG9yOiB0aGlzLnNldHRpbmdzLmRpY2VDb2xvciwgLy8gQWx3YXlzIGFwcGx5IGRpY2UgY29sb3IgKGFjdHMgYXMgdGludCB3aXRoIHRleHR1cmVzKVxyXG4gICAgICAgICAgICBzaGluaW5lc3M6IHRoaXMuc2V0dGluZ3MuZGljZVNoaW5pbmVzcyxcclxuICAgICAgICAgICAgc3BlY3VsYXI6IHRoaXMuc2V0dGluZ3MuZGljZVNwZWN1bGFyLFxyXG4gICAgICAgICAgICB0cmFuc3BhcmVudDogdGhpcy5zZXR0aW5ncy5kaWNlVHJhbnNwYXJlbnQsXHJcbiAgICAgICAgICAgIG9wYWNpdHk6IHRoaXMuc2V0dGluZ3MuZGljZU9wYWNpdHlcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICAvLyBBZGQgdGV4dHVyZSBpZiBhdmFpbGFibGVcclxuICAgICAgICBpZiAoY3VzdG9tVGV4dHVyZSkge1xyXG4gICAgICAgICAgICBtYXRlcmlhbFByb3BlcnRpZXMubWFwID0gY3VzdG9tVGV4dHVyZTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYEFwcGxpZWQgY3VzdG9tIHRleHR1cmUgdG8gJHt0aGlzLnNldHRpbmdzLmRpY2VUeXBlfSB3aXRoIGNvbG9yIHRpbnQgJHt0aGlzLnNldHRpbmdzLmRpY2VDb2xvcn1gKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgVXNpbmcgc29saWQgY29sb3IgbWF0ZXJpYWwgZm9yICR7dGhpcy5zZXR0aW5ncy5kaWNlVHlwZX06ICR7dGhpcy5zZXR0aW5ncy5kaWNlQ29sb3J9YCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBBZGQgbm9ybWFsIG1hcCBpZiBhdmFpbGFibGVcclxuICAgICAgICBpZiAobm9ybWFsTWFwKSB7XHJcbiAgICAgICAgICAgIG1hdGVyaWFsUHJvcGVydGllcy5ub3JtYWxNYXAgPSBub3JtYWxNYXA7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBBcHBsaWVkIG5vcm1hbCBtYXAgdG8gJHt0aGlzLnNldHRpbmdzLmRpY2VUeXBlfWApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIGFuZCBhcHBseSB0aGUgbWF0ZXJpYWxcclxuICAgICAgICB0aGlzLmRpY2UubWF0ZXJpYWwgPSBuZXcgVEhSRUUuTWVzaFBob25nTWF0ZXJpYWwobWF0ZXJpYWxQcm9wZXJ0aWVzKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBNZXRob2QgdG8gZ2VuZXJhdGUgVVYgbWFwcGluZyB0ZW1wbGF0ZSAoZm9yIGRldmVsb3BtZW50L3JlZmVyZW5jZSlcclxuICAgIHB1YmxpYyBnZW5lcmF0ZVVWVGVtcGxhdGUoKTogc3RyaW5nIHtcclxuICAgICAgICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcclxuICAgICAgICBjb25zdCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcclxuICAgICAgICBpZiAoIWN0eCkgcmV0dXJuICcnO1xyXG5cclxuICAgICAgICBjYW52YXMud2lkdGggPSA1MTI7XHJcbiAgICAgICAgY2FudmFzLmhlaWdodCA9IDUxMjtcclxuXHJcbiAgICAgICAgLy8gRDIwIGZhY2UgY29sb3JzIGFuZCBjb3JyZXNwb25kaW5nIG51bWJlcnNcclxuICAgICAgICBjb25zdCBmYWNlRGF0YSA9IFtcclxuICAgICAgICAgICAgeyBjb2xvcjogJyNGRjAwMDAnLCBudW1iZXI6IDEgfSwgICAvLyBSZWRcclxuICAgICAgICAgICAgeyBjb2xvcjogJyMwMEZGMDAnLCBudW1iZXI6IDIgfSwgICAvLyBHcmVlblxyXG4gICAgICAgICAgICB7IGNvbG9yOiAnIzAwMDBGRicsIG51bWJlcjogMyB9LCAgIC8vIEJsdWVcclxuICAgICAgICAgICAgeyBjb2xvcjogJyNGRkZGMDAnLCBudW1iZXI6IDQgfSwgICAvLyBZZWxsb3dcclxuICAgICAgICAgICAgeyBjb2xvcjogJyNGRjAwRkYnLCBudW1iZXI6IDUgfSwgICAvLyBNYWdlbnRhXHJcbiAgICAgICAgICAgIHsgY29sb3I6ICcjMDBGRkZGJywgbnVtYmVyOiA2IH0sICAgLy8gQ3lhblxyXG4gICAgICAgICAgICB7IGNvbG9yOiAnI0ZGQTUwMCcsIG51bWJlcjogNyB9LCAgIC8vIE9yYW5nZVxyXG4gICAgICAgICAgICB7IGNvbG9yOiAnIzgwMDA4MCcsIG51bWJlcjogOCB9LCAgIC8vIFB1cnBsZVxyXG4gICAgICAgICAgICB7IGNvbG9yOiAnI0ZGQzBDQicsIG51bWJlcjogOSB9LCAgIC8vIFBpbmtcclxuICAgICAgICAgICAgeyBjb2xvcjogJyNBNTJBMkEnLCBudW1iZXI6IDEwIH0sICAvLyBCcm93blxyXG4gICAgICAgICAgICB7IGNvbG9yOiAnIzgwODA4MCcsIG51bWJlcjogMTEgfSwgIC8vIEdyYXlcclxuICAgICAgICAgICAgeyBjb2xvcjogJyMwMDAwMDAnLCBudW1iZXI6IDEyIH0sICAvLyBCbGFja1xyXG4gICAgICAgICAgICB7IGNvbG9yOiAnI0ZGRkZGRicsIG51bWJlcjogMTMgfSwgIC8vIFdoaXRlXHJcbiAgICAgICAgICAgIHsgY29sb3I6ICcjOTBFRTkwJywgbnVtYmVyOiAxNCB9LCAgLy8gTGlnaHQgR3JlZW5cclxuICAgICAgICAgICAgeyBjb2xvcjogJyNGRkI2QzEnLCBudW1iZXI6IDE1IH0sICAvLyBMaWdodCBQaW5rXHJcbiAgICAgICAgICAgIHsgY29sb3I6ICcjODdDRUVCJywgbnVtYmVyOiAxNiB9LCAgLy8gU2t5IEJsdWVcclxuICAgICAgICAgICAgeyBjb2xvcjogJyNEREEwREQnLCBudW1iZXI6IDE3IH0sICAvLyBQbHVtXHJcbiAgICAgICAgICAgIHsgY29sb3I6ICcjRjBFNjhDJywgbnVtYmVyOiAxOCB9LCAgLy8gS2hha2lcclxuICAgICAgICAgICAgeyBjb2xvcjogJyMyMEIyQUEnLCBudW1iZXI6IDE5IH0sICAvLyBMaWdodCBTZWEgR3JlZW5cclxuICAgICAgICAgICAgeyBjb2xvcjogJyNEQzE0M0MnLCBudW1iZXI6IDIwIH0gICAvLyBDcmltc29uXHJcbiAgICAgICAgXTtcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIGEgNHg1IGdyaWQgbGF5b3V0IGZvciAyMCBmYWNlc1xyXG4gICAgICAgIGNvbnN0IGdyaWRDb2xzID0gNDtcclxuICAgICAgICBjb25zdCBncmlkUm93cyA9IDU7XHJcbiAgICAgICAgY29uc3QgY2VsbFdpZHRoID0gNTEyIC8gZ3JpZENvbHM7XHJcbiAgICAgICAgY29uc3QgY2VsbEhlaWdodCA9IDUxMiAvIGdyaWRSb3dzO1xyXG5cclxuICAgICAgICAvLyBGaWxsIGJhY2tncm91bmRcclxuICAgICAgICBjdHguZmlsbFN0eWxlID0gJyMzMzMzMzMnO1xyXG4gICAgICAgIGN0eC5maWxsUmVjdCgwLCAwLCA1MTIsIDUxMik7XHJcblxyXG4gICAgICAgIC8vIERyYXcgZWFjaCBmYWNlXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCAyMDsgaSsrKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJvdyA9IE1hdGguZmxvb3IoaSAvIGdyaWRDb2xzKTtcclxuICAgICAgICAgICAgY29uc3QgY29sID0gaSAlIGdyaWRDb2xzO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgeCA9IGNvbCAqIGNlbGxXaWR0aDtcclxuICAgICAgICAgICAgY29uc3QgeSA9IHJvdyAqIGNlbGxIZWlnaHQ7XHJcblxyXG4gICAgICAgICAgICAvLyBGaWxsIHRoZSBjZWxsIHdpdGggdGhlIGZhY2UgY29sb3JcclxuICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9IGZhY2VEYXRhW2ldLmNvbG9yO1xyXG4gICAgICAgICAgICBjdHguZmlsbFJlY3QoeCArIDIsIHkgKyAyLCBjZWxsV2lkdGggLSA0LCBjZWxsSGVpZ2h0IC0gNCk7XHJcblxyXG4gICAgICAgICAgICAvLyBBZGQgZmFjZSBudW1iZXJcclxuICAgICAgICAgICAgY3R4LmZpbGxTdHlsZSA9IGZhY2VEYXRhW2ldLmNvbG9yID09PSAnIzAwMDAwMCcgfHwgZmFjZURhdGFbaV0uY29sb3IgPT09ICcjODAwMDgwJyA/ICcjRkZGRkZGJyA6ICcjMDAwMDAwJztcclxuICAgICAgICAgICAgY3R4LmZvbnQgPSAnYm9sZCAzMnB4IEFyaWFsJztcclxuICAgICAgICAgICAgY3R4LnRleHRBbGlnbiA9ICdjZW50ZXInO1xyXG4gICAgICAgICAgICBjdHgudGV4dEJhc2VsaW5lID0gJ21pZGRsZSc7XHJcbiAgICAgICAgICAgIGN0eC5maWxsVGV4dChmYWNlRGF0YVtpXS5udW1iZXIudG9TdHJpbmcoKSwgeCArIGNlbGxXaWR0aC8yLCB5ICsgY2VsbEhlaWdodC8yKTtcclxuXHJcbiAgICAgICAgICAgIC8vIEFkZCBzbWFsbCBib3JkZXJcclxuICAgICAgICAgICAgY3R4LnN0cm9rZVN0eWxlID0gJyNDQ0NDQ0MnO1xyXG4gICAgICAgICAgICBjdHgubGluZVdpZHRoID0gMTtcclxuICAgICAgICAgICAgY3R4LnN0cm9rZVJlY3QoeCwgeSwgY2VsbFdpZHRoLCBjZWxsSGVpZ2h0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEFkZCB0aXRsZVxyXG4gICAgICAgIGN0eC5maWxsU3R5bGUgPSAnI0ZGRkZGRic7XHJcbiAgICAgICAgY3R4LmZvbnQgPSAnYm9sZCAxNnB4IEFyaWFsJztcclxuICAgICAgICBjdHgudGV4dEFsaWduID0gJ2xlZnQnO1xyXG4gICAgICAgIGN0eC5maWxsVGV4dCgnRDIwIFVWIE1hcHBpbmcgVGVtcGxhdGUnLCAxMCwgMjUpO1xyXG5cclxuICAgICAgICByZXR1cm4gY2FudmFzLnRvRGF0YVVSTCgnaW1hZ2UvcG5nJyk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gTWV0aG9kIHRvIGxvZyB0aGUgY29sb3IgbWFwcGluZyBmb3IgcmVmZXJlbmNlXHJcbiAgICBwdWJsaWMgbG9nQ29sb3JNYXBwaW5nKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnN0IGNvbG9yTWFwcGluZyA9IFtcclxuICAgICAgICAgICAgeyBmYWNlOiAxLCBjb2xvcjogJyNGRjAwMDAnLCBuYW1lOiAnUmVkJyB9LFxyXG4gICAgICAgICAgICB7IGZhY2U6IDIsIGNvbG9yOiAnIzAwRkYwMCcsIG5hbWU6ICdHcmVlbicgfSxcclxuICAgICAgICAgICAgeyBmYWNlOiAzLCBjb2xvcjogJyMwMDAwRkYnLCBuYW1lOiAnQmx1ZScgfSxcclxuICAgICAgICAgICAgeyBmYWNlOiA0LCBjb2xvcjogJyNGRkZGMDAnLCBuYW1lOiAnWWVsbG93JyB9LFxyXG4gICAgICAgICAgICB7IGZhY2U6IDUsIGNvbG9yOiAnI0ZGMDBGRicsIG5hbWU6ICdNYWdlbnRhJyB9LFxyXG4gICAgICAgICAgICB7IGZhY2U6IDYsIGNvbG9yOiAnIzAwRkZGRicsIG5hbWU6ICdDeWFuJyB9LFxyXG4gICAgICAgICAgICB7IGZhY2U6IDcsIGNvbG9yOiAnI0ZGQTUwMCcsIG5hbWU6ICdPcmFuZ2UnIH0sXHJcbiAgICAgICAgICAgIHsgZmFjZTogOCwgY29sb3I6ICcjODAwMDgwJywgbmFtZTogJ1B1cnBsZScgfSxcclxuICAgICAgICAgICAgeyBmYWNlOiA5LCBjb2xvcjogJyNGRkMwQ0InLCBuYW1lOiAnUGluaycgfSxcclxuICAgICAgICAgICAgeyBmYWNlOiAxMCwgY29sb3I6ICcjQTUyQTJBJywgbmFtZTogJ0Jyb3duJyB9LFxyXG4gICAgICAgICAgICB7IGZhY2U6IDExLCBjb2xvcjogJyM4MDgwODAnLCBuYW1lOiAnR3JheScgfSxcclxuICAgICAgICAgICAgeyBmYWNlOiAxMiwgY29sb3I6ICcjMDAwMDAwJywgbmFtZTogJ0JsYWNrJyB9LFxyXG4gICAgICAgICAgICB7IGZhY2U6IDEzLCBjb2xvcjogJyNGRkZGRkYnLCBuYW1lOiAnV2hpdGUnIH0sXHJcbiAgICAgICAgICAgIHsgZmFjZTogMTQsIGNvbG9yOiAnIzkwRUU5MCcsIG5hbWU6ICdMaWdodCBHcmVlbicgfSxcclxuICAgICAgICAgICAgeyBmYWNlOiAxNSwgY29sb3I6ICcjRkZCNkMxJywgbmFtZTogJ0xpZ2h0IFBpbmsnIH0sXHJcbiAgICAgICAgICAgIHsgZmFjZTogMTYsIGNvbG9yOiAnIzg3Q0VFQicsIG5hbWU6ICdTa3kgQmx1ZScgfSxcclxuICAgICAgICAgICAgeyBmYWNlOiAxNywgY29sb3I6ICcjRERBMEREJywgbmFtZTogJ1BsdW0nIH0sXHJcbiAgICAgICAgICAgIHsgZmFjZTogMTgsIGNvbG9yOiAnI0YwRTY4QycsIG5hbWU6ICdLaGFraScgfSxcclxuICAgICAgICAgICAgeyBmYWNlOiAxOSwgY29sb3I6ICcjMjBCMkFBJywgbmFtZTogJ0xpZ2h0IFNlYSBHcmVlbicgfSxcclxuICAgICAgICAgICAgeyBmYWNlOiAyMCwgY29sb3I6ICcjREMxNDNDJywgbmFtZTogJ0NyaW1zb24nIH1cclxuICAgICAgICBdO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZygn8J+OsiBEMjAgRmFjZS10by1Db2xvciBNYXBwaW5nOicpO1xyXG4gICAgICAgIGNvbnNvbGUudGFibGUoY29sb3JNYXBwaW5nKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldEN1cnJlbnREaWNlVGV4dHVyZURhdGEoKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgICAgICAgY29uc3QgdGV4dHVyZU1hcCA9IHRoaXMuc2V0dGluZ3MuZGljZVRleHR1cmVzIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ7XHJcbiAgICAgICAgaWYgKHRleHR1cmVNYXApIHtcclxuICAgICAgICAgICAgY29uc3QgcGVyVHlwZSA9IHRleHR1cmVNYXBbdGhpcy5zZXR0aW5ncy5kaWNlVHlwZV07XHJcbiAgICAgICAgICAgIGlmIChwZXJUeXBlICYmIHBlclR5cGUudHJpbSgpICE9PSAnJykge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHBlclR5cGU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZ2V0RmFjZUNvdW50KCk6IG51bWJlciB7XHJcbiAgICAgICAgc3dpdGNoICh0aGlzLnNldHRpbmdzLmRpY2VUeXBlKSB7XHJcbiAgICAgICAgICAgIGNhc2UgJ2Q0JzogcmV0dXJuIDQ7XHJcbiAgICAgICAgICAgIGNhc2UgJ2Q2JzogcmV0dXJuIDY7XHJcbiAgICAgICAgICAgIGNhc2UgJ2Q4JzogcmV0dXJuIDg7XHJcbiAgICAgICAgICAgIGNhc2UgJ2QxMCc6IHJldHVybiAxMDtcclxuICAgICAgICAgICAgY2FzZSAnZDEyJzogcmV0dXJuIDEyO1xyXG4gICAgICAgICAgICBjYXNlICdkMjAnOiByZXR1cm4gMjA7XHJcbiAgICAgICAgICAgIGRlZmF1bHQ6IHJldHVybiAyMDtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkQ3VzdG9tVGV4dHVyZSh0ZXh0dXJlRGF0YT86IHN0cmluZyk6IFRIUkVFLlRleHR1cmUgfCBudWxsIHtcclxuICAgICAgICBpZiAoIXRleHR1cmVEYXRhKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgLy8gQ3JlYXRlIGltYWdlIGVsZW1lbnQgdG8gbG9hZCB0aGUgdGV4dHVyZVxyXG4gICAgICAgICAgICBjb25zdCBpbWcgPSBuZXcgSW1hZ2UoKTtcclxuICAgICAgICAgICAgaW1nLmNyb3NzT3JpZ2luID0gJ2Fub255bW91cyc7XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0ZXh0dXJlID0gbmV3IFRIUkVFLlRleHR1cmUoKTtcclxuICAgICAgICAgICAgdGV4dHVyZS5pbWFnZSA9IGltZztcclxuICAgICAgICAgICAgdGV4dHVyZS53cmFwUyA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7IC8vIFVzZSBjbGFtcCBmb3IgY2xlYW4gZWRnZXNcclxuICAgICAgICAgICAgdGV4dHVyZS53cmFwVCA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7XHJcbiAgICAgICAgICAgIHRleHR1cmUubWluRmlsdGVyID0gVEhSRUUuTGluZWFyRmlsdGVyO1xyXG4gICAgICAgICAgICB0ZXh0dXJlLm1hZ0ZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcclxuICAgICAgICAgICAgdGV4dHVyZS5nZW5lcmF0ZU1pcG1hcHMgPSBmYWxzZTsgLy8gRGlzYWJsZSBtaXBtYXBzIHRvIHJlZHVjZSBtZW1vcnkgdXNhZ2VcclxuXHJcbiAgICAgICAgICAgIC8vIExvYWQgdGhlIGltYWdlXHJcbiAgICAgICAgICAgIGltZy5vbmxvYWQgPSAoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0ZXh0dXJlLm5lZWRzVXBkYXRlID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdDdXN0b20gdGV4dHVyZSBsb2FkZWQgc3VjY2Vzc2Z1bGx5Jyk7XHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICBpbWcub25lcnJvciA9IChlcnJvcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgY3VzdG9tIHRleHR1cmUgaW1hZ2U6JywgZXJyb3IpO1xyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgaW1nLnNyYyA9IHRleHR1cmVEYXRhO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHRleHR1cmU7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgY3VzdG9tIGRpY2UgdGV4dHVyZTonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldEN1cnJlbnREaWNlTm9ybWFsTWFwRGF0YSgpOiBzdHJpbmcgfCBudWxsIHtcclxuICAgICAgICAvLyBDaGVjayBmb3IgcGVyLWRpY2UtdHlwZSBub3JtYWwgbWFwXHJcbiAgICAgICAgY29uc3QgZGljZVR5cGUgPSB0aGlzLnNldHRpbmdzLmRpY2VUeXBlO1xyXG4gICAgICAgIGNvbnN0IG5vcm1hbE1hcERhdGEgPSB0aGlzLnNldHRpbmdzLmRpY2VOb3JtYWxNYXBzW2RpY2VUeXBlXTtcclxuXHJcbiAgICAgICAgaWYgKG5vcm1hbE1hcERhdGEgJiYgbm9ybWFsTWFwRGF0YS50cmltKCkgIT09ICcnKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBub3JtYWxNYXBEYXRhO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBsb2FkTm9ybWFsTWFwKG5vcm1hbE1hcERhdGE/OiBzdHJpbmcpOiBUSFJFRS5UZXh0dXJlIHwgbnVsbCB7XHJcbiAgICAgICAgaWYgKCFub3JtYWxNYXBEYXRhKSByZXR1cm4gbnVsbDtcclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgLy8gQ3JlYXRlIGltYWdlIGVsZW1lbnQgdG8gbG9hZCB0aGUgbm9ybWFsIG1hcFxyXG4gICAgICAgICAgICBjb25zdCBpbWcgPSBuZXcgSW1hZ2UoKTtcclxuICAgICAgICAgICAgaW1nLmNyb3NzT3JpZ2luID0gJ2Fub255bW91cyc7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBub3JtYWxNYXAgPSBuZXcgVEhSRUUuVGV4dHVyZSgpO1xyXG4gICAgICAgICAgICBub3JtYWxNYXAuaW1hZ2UgPSBpbWc7XHJcbiAgICAgICAgICAgIG5vcm1hbE1hcC53cmFwUyA9IFRIUkVFLkNsYW1wVG9FZGdlV3JhcHBpbmc7IC8vIFVzZSBjbGFtcCBmb3IgY2xlYW4gZWRnZXNcclxuICAgICAgICAgICAgbm9ybWFsTWFwLndyYXBUID0gVEhSRUUuQ2xhbXBUb0VkZ2VXcmFwcGluZztcclxuICAgICAgICAgICAgbm9ybWFsTWFwLm1pbkZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcclxuICAgICAgICAgICAgbm9ybWFsTWFwLm1hZ0ZpbHRlciA9IFRIUkVFLkxpbmVhckZpbHRlcjtcclxuICAgICAgICAgICAgbm9ybWFsTWFwLmdlbmVyYXRlTWlwbWFwcyA9IGZhbHNlOyAvLyBEaXNhYmxlIG1pcG1hcHMgdG8gcmVkdWNlIG1lbW9yeSB1c2FnZVxyXG5cclxuICAgICAgICAgICAgLy8gTG9hZCB0aGUgaW1hZ2VcclxuICAgICAgICAgICAgaW1nLm9ubG9hZCA9ICgpID0+IHtcclxuICAgICAgICAgICAgICAgIG5vcm1hbE1hcC5uZWVkc1VwZGF0ZSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnTm9ybWFsIG1hcCBsb2FkZWQgc3VjY2Vzc2Z1bGx5Jyk7XHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICBpbWcub25lcnJvciA9IChlcnJvcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgbm9ybWFsIG1hcCBpbWFnZTonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICBpbWcuc3JjID0gbm9ybWFsTWFwRGF0YTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiBub3JtYWxNYXA7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgbm9ybWFsIG1hcDonLCBlcnJvcik7XHJcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcblxyXG4gICAgcHJpdmF0ZSBzZXR1cExpZ2h0aW5nKCkge1xyXG4gICAgICAgIC8vIENsZWFyIGV4aXN0aW5nIGxpZ2h0c1xyXG4gICAgICAgIGlmICh0aGlzLmFtYmllbnRMaWdodCkge1xyXG4gICAgICAgICAgICB0aGlzLnNjZW5lLnJlbW92ZSh0aGlzLmFtYmllbnRMaWdodCk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGlmICh0aGlzLmRpcmVjdGlvbmFsTGlnaHQpIHtcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5yZW1vdmUodGhpcy5kaXJlY3Rpb25hbExpZ2h0KTtcclxuICAgICAgICAgICAgaWYgKHRoaXMuZGlyZWN0aW9uYWxMaWdodC50YXJnZXQpIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuc2NlbmUucmVtb3ZlKHRoaXMuZGlyZWN0aW9uYWxMaWdodC50YXJnZXQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBBbWJpZW50IGxpZ2h0IHdpdGggY29uZmlndXJhYmxlIGludGVuc2l0eSBhbmQgY29sb3JcclxuICAgICAgICB0aGlzLmFtYmllbnRMaWdodCA9IG5ldyBUSFJFRS5BbWJpZW50TGlnaHQoXHJcbiAgICAgICAgICAgIG5ldyBUSFJFRS5Db2xvcih0aGlzLnNldHRpbmdzLmFtYmllbnRMaWdodENvbG9yKSxcclxuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy5hbWJpZW50TGlnaHRJbnRlbnNpdHlcclxuICAgICAgICApO1xyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMuYW1iaWVudExpZ2h0KTtcclxuXHJcbiAgICAgICAgLy8gRGlyZWN0aW9uYWwgbGlnaHQgd2l0aCBjb25maWd1cmFibGUgcHJvcGVydGllc1xyXG4gICAgICAgIHRoaXMuZGlyZWN0aW9uYWxMaWdodCA9IG5ldyBUSFJFRS5EaXJlY3Rpb25hbExpZ2h0KFxyXG4gICAgICAgICAgICBuZXcgVEhSRUUuQ29sb3IodGhpcy5zZXR0aW5ncy5kaXJlY3Rpb25hbExpZ2h0Q29sb3IpLFxyXG4gICAgICAgICAgICB0aGlzLnNldHRpbmdzLmRpcmVjdGlvbmFsTGlnaHRJbnRlbnNpdHlcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICAvLyBTZXQgY29uZmlndXJhYmxlIHBvc2l0aW9uXHJcbiAgICAgICAgdGhpcy5kaXJlY3Rpb25hbExpZ2h0LnBvc2l0aW9uLnNldChcclxuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy5kaXJlY3Rpb25hbExpZ2h0UG9zaXRpb25YLFxyXG4gICAgICAgICAgICB0aGlzLnNldHRpbmdzLmRpcmVjdGlvbmFsTGlnaHRQb3NpdGlvblksXHJcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MuZGlyZWN0aW9uYWxMaWdodFBvc2l0aW9uWlxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vIFRhcmdldCB0aGUgY2VudGVyIG9mIHRoZSBkaWNlIHRyYXlcclxuICAgICAgICB0aGlzLmRpcmVjdGlvbmFsTGlnaHQudGFyZ2V0LnBvc2l0aW9uLnNldCgwLCAtMiwgMCk7XHJcblxyXG4gICAgICAgIC8vIENvbmZpZ3VyZSBzaGFkb3dzIGlmIGVuYWJsZWRcclxuICAgICAgICB0aGlzLmRpcmVjdGlvbmFsTGlnaHQuY2FzdFNoYWRvdyA9IHRoaXMuc2V0dGluZ3MuZW5hYmxlU2hhZG93cztcclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZW5hYmxlU2hhZG93cykge1xyXG4gICAgICAgICAgICAvLyBDb25maWd1cmUgc2hhZG93IGNhbWVyYSBmb3Igb3B0aW1hbCBzaGFkb3cgcXVhbGl0eVxyXG4gICAgICAgICAgICB0aGlzLmRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5uZWFyID0gMC4xO1xyXG4gICAgICAgICAgICB0aGlzLmRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5mYXIgPSAxMDA7XHJcbiAgICAgICAgICAgIHRoaXMuZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLmxlZnQgPSAtMjA7XHJcbiAgICAgICAgICAgIHRoaXMuZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLnJpZ2h0ID0gMjA7XHJcbiAgICAgICAgICAgIHRoaXMuZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cuY2FtZXJhLnRvcCA9IDIwO1xyXG4gICAgICAgICAgICB0aGlzLmRpcmVjdGlvbmFsTGlnaHQuc2hhZG93LmNhbWVyYS5ib3R0b20gPSAtMjA7XHJcblxyXG4gICAgICAgICAgICAvLyBIaWdoZXIgcmVzb2x1dGlvbiBzaGFkb3dzXHJcbiAgICAgICAgICAgIHRoaXMuZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cubWFwU2l6ZS53aWR0aCA9IDIwNDg7XHJcbiAgICAgICAgICAgIHRoaXMuZGlyZWN0aW9uYWxMaWdodC5zaGFkb3cubWFwU2l6ZS5oZWlnaHQgPSAyMDQ4O1xyXG5cclxuICAgICAgICAgICAgLy8gU29mdCBzaGFkb3cgYmlhcyB0byByZWR1Y2Ugc2hhZG93IGFjbmVcclxuICAgICAgICAgICAgdGhpcy5kaXJlY3Rpb25hbExpZ2h0LnNoYWRvdy5iaWFzID0gLTAuMDAwMTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRoaXMuc2NlbmUuYWRkKHRoaXMuZGlyZWN0aW9uYWxMaWdodCk7XHJcbiAgICAgICAgdGhpcy5zY2VuZS5hZGQodGhpcy5kaXJlY3Rpb25hbExpZ2h0LnRhcmdldCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzZXR1cERyYWdDb250cm9scygpIHtcclxuICAgICAgICBjb25zdCBjYW52YXMgPSB0aGlzLnJlbmRlcmVyLmRvbUVsZW1lbnQ7XHJcblxyXG4gICAgICAgIC8vIFNldCB1cCBldmVudHMgZGlyZWN0bHkgb24gY2FudmFzXHJcbiAgICAgICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIChldmVudCkgPT4gdGhpcy5vbk1vdXNlRG93bihldmVudCkpO1xyXG4gICAgICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgKGV2ZW50KSA9PiB0aGlzLm9uTW91c2VVcChldmVudCkpO1xyXG4gICAgICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCAoZXZlbnQpID0+IHRoaXMub25Nb3VzZU1vdmUoZXZlbnQpKTtcclxuICAgICAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VsZWF2ZScsIChldmVudCkgPT4gdGhpcy5vbk1vdXNlTGVhdmUoZXZlbnQpKTtcclxuICAgICAgICBjYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignbW91c2VlbnRlcicsIChldmVudCkgPT4gdGhpcy5vbk1vdXNlRW50ZXIoZXZlbnQpKTtcclxuXHJcbiAgICAgICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCAoZXZlbnQpID0+IHRoaXMub25Ub3VjaFN0YXJ0KGV2ZW50KSk7XHJcbiAgICAgICAgY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNobW92ZScsIChldmVudCkgPT4gdGhpcy5vblRvdWNoTW92ZShldmVudCkpO1xyXG4gICAgICAgIGNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCd0b3VjaGVuZCcsIChldmVudCkgPT4gdGhpcy5vblRvdWNoRW5kKGV2ZW50KSk7XHJcblxyXG4gICAgICAgIC8vIFN0YXJ0IHdpdGggY2xpY2stdGhyb3VnaCBlbmFibGVkXHJcbiAgICAgICAgY2FudmFzLnN0eWxlLnBvaW50ZXJFdmVudHMgPSAnbm9uZSc7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSB1cGRhdGVNb3VzZVBvc2l0aW9uKGNsaWVudFg6IG51bWJlciwgY2xpZW50WTogbnVtYmVyKSB7XHJcbiAgICAgICAgY29uc3QgcmVjdCA9IHRoaXMucmVuZGVyZXIuZG9tRWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcclxuICAgICAgICB0aGlzLm1vdXNlLnggPSAoKGNsaWVudFggLSByZWN0LmxlZnQpIC8gcmVjdC53aWR0aCkgKiAyIC0gMTtcclxuICAgICAgICB0aGlzLm1vdXNlLnkgPSAtKChjbGllbnRZIC0gcmVjdC50b3ApIC8gcmVjdC5oZWlnaHQpICogMiArIDE7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1vdXNlRG93bihldmVudDogTW91c2VFdmVudCkge1xyXG4gICAgICAgIHRoaXMudXBkYXRlTW91c2VQb3NpdGlvbihldmVudC5jbGllbnRYLCBldmVudC5jbGllbnRZKTtcclxuICAgICAgICB0aGlzLmRyYWdTdGFydFBvc2l0aW9uID0geyB4OiBldmVudC5jbGllbnRYLCB5OiBldmVudC5jbGllbnRZIH07XHJcblxyXG4gICAgICAgIC8vIE9ubHkgaGFuZGxlIHRoZSBjbGljayBpZiB3ZSBjbGlja2VkIG9uIHRoZSBkaWNlXHJcbiAgICAgICAgY29uc3QgZGlkQ2xpY2tEaWNlID0gdGhpcy5jaGVja0RpY2VDbGljayhldmVudCk7XHJcblxyXG4gICAgICAgIGlmICghZGlkQ2xpY2tEaWNlKSB7XHJcbiAgICAgICAgICAgIC8vIElmIG5vdCBjbGlja2luZyBvbiBkaWNlLCBkb24ndCBwcmV2ZW50IHRoZSBldmVudFxyXG4gICAgICAgICAgICAvLyBMZXQgaXQgcGFzcyB0aHJvdWdoIHRvIE9ic2lkaWFuXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvblRvdWNoU3RhcnQoZXZlbnQ6IFRvdWNoRXZlbnQpIHtcclxuICAgICAgICBpZiAoZXZlbnQudG91Y2hlcy5sZW5ndGggPT09IDEpIHtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVNb3VzZVBvc2l0aW9uKGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WCwgZXZlbnQudG91Y2hlc1swXS5jbGllbnRZKTtcclxuICAgICAgICAgICAgdGhpcy5kcmFnU3RhcnRQb3NpdGlvbiA9IHsgeDogZXZlbnQudG91Y2hlc1swXS5jbGllbnRYLCB5OiBldmVudC50b3VjaGVzWzBdLmNsaWVudFkgfTtcclxuXHJcbiAgICAgICAgICAgIC8vIENyZWF0ZSBhIG1vY2sgbW91c2UgZXZlbnQgZm9yIGRpY2UgY2hlY2tpbmdcclxuICAgICAgICAgICAgY29uc3QgbW9ja0V2ZW50ID0gbmV3IE1vdXNlRXZlbnQoJ21vdXNlZG93bicsIHtcclxuICAgICAgICAgICAgICAgIGJ1YmJsZXM6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBjYW5jZWxhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgY2xpZW50WDogZXZlbnQudG91Y2hlc1swXS5jbGllbnRYLFxyXG4gICAgICAgICAgICAgICAgY2xpZW50WTogZXZlbnQudG91Y2hlc1swXS5jbGllbnRZXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZGljZUNsaWNrZWQgPSB0aGlzLmNoZWNrRGljZUNsaWNrKG1vY2tFdmVudCk7XHJcblxyXG4gICAgICAgICAgICBpZiAoIWRpY2VDbGlja2VkKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBBbGxvdyB0b3VjaCB0byBwYXNzIHRocm91Z2ggaWYgbm90IHRvdWNoaW5nIGRpY2VcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1vdXNlTW92ZShldmVudDogTW91c2VFdmVudCkge1xyXG4gICAgICAgIHRoaXMudXBkYXRlTW91c2VQb3NpdGlvbihldmVudC5jbGllbnRYLCBldmVudC5jbGllbnRZKTtcclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgZm9yIGhvdmVyIHRvIHNob3cgdmlzdWFsIGZlZWRiYWNrIG9ubHkgKG11bHRpLWRpY2Ugc3lzdGVtKVxyXG4gICAgICAgIGlmICghdGhpcy5pc1JvbGxpbmcgJiYgIXRoaXMuaXNEcmFnZ2luZyAmJiB0aGlzLmRpY2VBcnJheS5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgICAgIHRoaXMucmF5Y2FzdGVyLnNldEZyb21DYW1lcmEodGhpcy5tb3VzZSwgdGhpcy5jYW1lcmEpO1xyXG4gICAgICAgICAgICBjb25zdCBpbnRlcnNlY3RzID0gdGhpcy5yYXljYXN0ZXIuaW50ZXJzZWN0T2JqZWN0cyh0aGlzLmRpY2VBcnJheSwgdHJ1ZSk7XHJcblxyXG4gICAgICAgICAgICB0aGlzLmlzSG92ZXJpbmdEaWNlID0gaW50ZXJzZWN0cy5sZW5ndGggPiAwO1xyXG5cclxuICAgICAgICAgICAgLy8gVXBkYXRlIGN1cnNvciBmb3IgdmlzdWFsIGZlZWRiYWNrXHJcbiAgICAgICAgICAgIGNvbnN0IGNhbnZhcyA9IHRoaXMucmVuZGVyZXIuZG9tRWxlbWVudDtcclxuICAgICAgICAgICAgaWYgKHRoaXMuaXNIb3ZlcmluZ0RpY2UgJiYgIXRoaXMuZm9yY2VDbGlja3Rocm91Z2hNb2RlKSB7XHJcbiAgICAgICAgICAgICAgICBjYW52YXMuc3R5bGUuY3Vyc29yID0gJ2dyYWInO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgY2FudmFzLnN0eWxlLmN1cnNvciA9ICdkZWZhdWx0JztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHRoaXMuaXNEcmFnZ2luZykge1xyXG4gICAgICAgICAgICAvLyBDYWxjdWxhdGUgbW91c2UgdmVsb2NpdHkgZm9yIG1vbWVudHVtXHJcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgICAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gY3VycmVudFRpbWUgLSB0aGlzLmxhc3RNb3VzZVBvc2l0aW9uLnRpbWU7XHJcblxyXG4gICAgICAgICAgICBpZiAoZGVsdGFUaW1lID4gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5tb3VzZVZlbG9jaXR5LnggPSAoZXZlbnQuY2xpZW50WCAtIHRoaXMubGFzdE1vdXNlUG9zaXRpb24ueCkgLyBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm1vdXNlVmVsb2NpdHkueSA9IChldmVudC5jbGllbnRZIC0gdGhpcy5sYXN0TW91c2VQb3NpdGlvbi55KSAvIGRlbHRhVGltZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdGhpcy5sYXN0TW91c2VQb3NpdGlvbiA9IHsgeDogZXZlbnQuY2xpZW50WCwgeTogZXZlbnQuY2xpZW50WSwgdGltZTogY3VycmVudFRpbWUgfTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMudXBkYXRlRGljZVBvc2l0aW9uKCk7XHJcbiAgICAgICAgICAgIHRoaXMucmVuZGVyZXIuZG9tRWxlbWVudC5zdHlsZS5jdXJzb3IgPSAnZ3JhYmJpbmcnO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTW91c2VFbnRlcihldmVudDogTW91c2VFdmVudCkge1xyXG4gICAgICAgIHRoaXMudXBkYXRlTW91c2VQb3NpdGlvbihldmVudC5jbGllbnRYLCBldmVudC5jbGllbnRZKTtcclxuICAgICAgICBpZiAoIXRoaXMuaXNSb2xsaW5nICYmICF0aGlzLmlzRHJhZ2dpbmcgJiYgdGhpcy5kaWNlQXJyYXkubGVuZ3RoID4gMCkge1xyXG4gICAgICAgICAgICB0aGlzLnJheWNhc3Rlci5zZXRGcm9tQ2FtZXJhKHRoaXMubW91c2UsIHRoaXMuY2FtZXJhKTtcclxuICAgICAgICAgICAgY29uc3QgaW50ZXJzZWN0cyA9IHRoaXMucmF5Y2FzdGVyLmludGVyc2VjdE9iamVjdHModGhpcy5kaWNlQXJyYXksIHRydWUpO1xyXG4gICAgICAgICAgICB0aGlzLmlzSG92ZXJpbmdEaWNlID0gaW50ZXJzZWN0cy5sZW5ndGggPiAwO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uTW91c2VMZWF2ZShldmVudDogTW91c2VFdmVudCkge1xyXG4gICAgICAgIGlmICghdGhpcy5pc0RyYWdnaW5nKSB7XHJcbiAgICAgICAgICAgIHRoaXMuaXNIb3ZlcmluZ0RpY2UgPSBmYWxzZTtcclxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5kb21FbGVtZW50LnN0eWxlLmN1cnNvciA9ICdkZWZhdWx0JztcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG5cclxuXHJcblxyXG5cclxuXHJcbiAgICBwcml2YXRlIG9uVG91Y2hNb3ZlKGV2ZW50OiBUb3VjaEV2ZW50KSB7XHJcbiAgICAgICAgaWYgKHRoaXMuaXNEcmFnZ2luZyAmJiBldmVudC50b3VjaGVzLmxlbmd0aCA9PT0gMSkge1xyXG4gICAgICAgICAgICAvLyBDYWxjdWxhdGUgdG91Y2ggdmVsb2NpdHkgZm9yIG1vbWVudHVtXHJcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRUaW1lID0gRGF0ZS5ub3coKTtcclxuICAgICAgICAgICAgY29uc3QgZGVsdGFUaW1lID0gY3VycmVudFRpbWUgLSB0aGlzLmxhc3RNb3VzZVBvc2l0aW9uLnRpbWU7XHJcblxyXG4gICAgICAgICAgICBpZiAoZGVsdGFUaW1lID4gMCkge1xyXG4gICAgICAgICAgICAgICAgdGhpcy5tb3VzZVZlbG9jaXR5LnggPSAoZXZlbnQudG91Y2hlc1swXS5jbGllbnRYIC0gdGhpcy5sYXN0TW91c2VQb3NpdGlvbi54KSAvIGRlbHRhVGltZTtcclxuICAgICAgICAgICAgICAgIHRoaXMubW91c2VWZWxvY2l0eS55ID0gKGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WSAtIHRoaXMubGFzdE1vdXNlUG9zaXRpb24ueSkgLyBkZWx0YVRpbWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRoaXMubGFzdE1vdXNlUG9zaXRpb24gPSB7IHg6IGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WCwgeTogZXZlbnQudG91Y2hlc1swXS5jbGllbnRZLCB0aW1lOiBjdXJyZW50VGltZSB9O1xyXG5cclxuICAgICAgICAgICAgdGhpcy51cGRhdGVNb3VzZVBvc2l0aW9uKGV2ZW50LnRvdWNoZXNbMF0uY2xpZW50WCwgZXZlbnQudG91Y2hlc1swXS5jbGllbnRZKTtcclxuICAgICAgICAgICAgdGhpcy51cGRhdGVEaWNlUG9zaXRpb24oKTtcclxuICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBvbk1vdXNlVXAoZXZlbnQ6IE1vdXNlRXZlbnQpIHtcclxuICAgICAgICBpZiAodGhpcy5pc0RyYWdnaW5nKSB7XHJcbiAgICAgICAgICAgIHRoaXMudGhyb3dEaWNlKGV2ZW50LmNsaWVudFgsIGV2ZW50LmNsaWVudFkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG9uVG91Y2hFbmQoZXZlbnQ6IFRvdWNoRXZlbnQpIHtcclxuICAgICAgICBpZiAodGhpcy5pc0RyYWdnaW5nKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHRvdWNoID0gZXZlbnQuY2hhbmdlZFRvdWNoZXNbMF07XHJcbiAgICAgICAgICAgIHRoaXMudGhyb3dEaWNlKHRvdWNoLmNsaWVudFgsIHRvdWNoLmNsaWVudFkpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGNoZWNrRGljZUNsaWNrKGV2ZW50OiBNb3VzZUV2ZW50KSB7XHJcbiAgICAgICAgdGhpcy5yYXljYXN0ZXIuc2V0RnJvbUNhbWVyYSh0aGlzLm1vdXNlLCB0aGlzLmNhbWVyYSk7XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGZvciBpbnRlcnNlY3Rpb25zIHdpdGggYWxsIGRpY2VcclxuICAgICAgICBjb25zdCBpbnRlcnNlY3RzID0gdGhpcy5yYXljYXN0ZXIuaW50ZXJzZWN0T2JqZWN0cyh0aGlzLmRpY2VBcnJheSwgdHJ1ZSk7XHJcblxyXG4gICAgICAgIGlmIChpbnRlcnNlY3RzLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgLy8gRmluZCB3aGljaCBkaWNlIHdhcyBjbGlja2VkXHJcbiAgICAgICAgICAgIGNvbnN0IGNsaWNrZWRPYmplY3QgPSBpbnRlcnNlY3RzWzBdLm9iamVjdDtcclxuICAgICAgICAgICAgbGV0IGNsaWNrZWREaWNlSW5kZXggPSAtMTtcclxuXHJcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5kaWNlQXJyYXkubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmRpY2VBcnJheVtpXSA9PT0gY2xpY2tlZE9iamVjdCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNsaWNrZWREaWNlSW5kZXggPSBpO1xyXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAoY2xpY2tlZERpY2VJbmRleCA9PT0gLTEpIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICAgICAgICAgIC8vIE9ubHkgcHJldmVudCBldmVudCBwcm9wYWdhdGlvbiB3aGVuIGFjdHVhbGx5IGNsaWNraW5nIG9uIGRpY2VcclxuICAgICAgICAgICAgZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XHJcbiAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XHJcblxyXG4gICAgICAgICAgICAvLyBIYW5kbGUgZGlmZmVyZW50IGludGVyYWN0aW9uIG1vZGVzXHJcbiAgICAgICAgICAgIGlmIChldmVudC5jdHJsS2V5ICYmIGV2ZW50LmFsdEtleSkge1xyXG4gICAgICAgICAgICAgICAgLy8gQ3RybCtBbHQrQ2xpY2s6IERlbGV0ZSBkaWNlXHJcbiAgICAgICAgICAgICAgICB0aGlzLmRlbGV0ZURpY2VBdEluZGV4KGNsaWNrZWREaWNlSW5kZXgpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoZXZlbnQuY3RybEtleSkge1xyXG4gICAgICAgICAgICAgICAgLy8gQ3RybCtDbGljazogU2VsZWN0L2RyYWcgYWxsIGRpY2VcclxuICAgICAgICAgICAgICAgIHRoaXMuc3RhcnREcmFnQWxsRGljZSgpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAvLyBSZWd1bGFyIGNsaWNrOiBTZWxlY3QvZHJhZyBpbmRpdmlkdWFsIGRpY2VcclxuICAgICAgICAgICAgICAgIHRoaXMuc3RhcnREcmFnU2luZ2xlRGljZShjbGlja2VkRGljZUluZGV4KTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICByZXR1cm4gZmFsc2U7IC8vIEluZGljYXRlIHRoYXQgbm8gZGljZSB3YXMgY2xpY2tlZFxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZGVsZXRlRGljZUF0SW5kZXgoaW5kZXg6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy5kaWNlQXJyYXkubGVuZ3RoKSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IGRpY2VUeXBlID0gdGhpcy5kaWNlVHlwZUFycmF5W2luZGV4XTtcclxuXHJcbiAgICAgICAgLy8gUmVtb3ZlIGZyb20gc2NlbmUgYW5kIHBoeXNpY3NcclxuICAgICAgICB0aGlzLnNjZW5lLnJlbW92ZSh0aGlzLmRpY2VBcnJheVtpbmRleF0pO1xyXG4gICAgICAgIHRoaXMud29ybGQucmVtb3ZlQm9keSh0aGlzLmRpY2VCb2R5QXJyYXlbaW5kZXhdKTtcclxuXHJcbiAgICAgICAgLy8gRGlzcG9zZSBnZW9tZXRyeSBhbmQgbWF0ZXJpYWxcclxuICAgICAgICB0aGlzLmRpY2VBcnJheVtpbmRleF0uZ2VvbWV0cnkuZGlzcG9zZSgpO1xyXG4gICAgICAgIGlmICh0aGlzLmRpY2VBcnJheVtpbmRleF0ubWF0ZXJpYWwgJiYgIUFycmF5LmlzQXJyYXkodGhpcy5kaWNlQXJyYXlbaW5kZXhdLm1hdGVyaWFsKSkge1xyXG4gICAgICAgICAgICAodGhpcy5kaWNlQXJyYXlbaW5kZXhdLm1hdGVyaWFsIGFzIFRIUkVFLk1hdGVyaWFsKS5kaXNwb3NlKCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBSZW1vdmUgZnJvbSBhcnJheXNcclxuICAgICAgICB0aGlzLmRpY2VBcnJheS5zcGxpY2UoaW5kZXgsIDEpO1xyXG4gICAgICAgIHRoaXMuZGljZUJvZHlBcnJheS5zcGxpY2UoaW5kZXgsIDEpO1xyXG4gICAgICAgIHRoaXMuZGljZVR5cGVBcnJheS5zcGxpY2UoaW5kZXgsIDEpO1xyXG5cclxuICAgICAgICAvLyBVcGRhdGUgZGljZSBjb3VudCBpbiBzZXR0aW5nc1xyXG4gICAgICAgICh0aGlzLnNldHRpbmdzLmRpY2VDb3VudHMgYXMgYW55KVtkaWNlVHlwZV0tLTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coYERlbGV0ZWQgJHtkaWNlVHlwZX0gZGljZS4gUmVtYWluaW5nOiAke3RoaXMuZGljZUFycmF5Lmxlbmd0aH1gKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0RHJhZ1NpbmdsZURpY2UoaW5kZXg6IG51bWJlcik6IHZvaWQge1xyXG4gICAgICAgIHRoaXMuaXNEcmFnZ2luZyA9IHRydWU7XHJcbiAgICAgICAgdGhpcy5kcmFnZ2VkRGljZUluZGV4ID0gaW5kZXg7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5kb21FbGVtZW50LnN0eWxlLmN1cnNvciA9ICdncmFiYmluZyc7XHJcblxyXG4gICAgICAgIC8vIENsZWFyIGhpZ2hsaWdodCBhbmQgcmVzZXQgc3RhdGUgaWYgdGhpcyBkaWNlIHdhcyBjYXVnaHRcclxuICAgICAgICBjb25zdCBzdGF0ZSA9IHRoaXMuZGljZVN0YXRlc1tpbmRleF07XHJcbiAgICAgICAgaWYgKHN0YXRlICYmIHN0YXRlLmlzQ2F1Z2h0KSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5SEIENsZWFyaW5nIGhpZ2hsaWdodCBmcm9tIGNhdWdodCBkaWNlICR7aW5kZXh9IC0gbWFudWFsIHRocm93YCk7XHJcbiAgICAgICAgICAgIHRoaXMuaGlnaGxpZ2h0Q2F1Z2h0RGljZShpbmRleCwgZmFsc2UpO1xyXG4gICAgICAgICAgICBzdGF0ZS5pc0NhdWdodCA9IGZhbHNlO1xyXG4gICAgICAgICAgICBzdGF0ZS5pc0NvbXBsZXRlID0gZmFsc2U7XHJcbiAgICAgICAgICAgIHN0YXRlLnJlc3VsdCA9IG51bGw7XHJcbiAgICAgICAgICAgIHN0YXRlLnN0YWJsZVRpbWUgPSAwO1xyXG4gICAgICAgICAgICBzdGF0ZS5pc1JvbGxpbmcgPSB0cnVlO1xyXG4gICAgICAgICAgICBzdGF0ZS5sYXN0TW90aW9uID0gRGF0ZS5ub3coKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEluaXRpYWxpemUgdmVsb2NpdHkgdHJhY2tpbmdcclxuICAgICAgICB0aGlzLmxhc3RNb3VzZVBvc2l0aW9uID0geyB4OiB0aGlzLmRyYWdTdGFydFBvc2l0aW9uLngsIHk6IHRoaXMuZHJhZ1N0YXJ0UG9zaXRpb24ueSwgdGltZTogRGF0ZS5ub3coKSB9O1xyXG4gICAgICAgIHRoaXMubW91c2VWZWxvY2l0eSA9IHsgeDogMCwgeTogMCB9O1xyXG5cclxuICAgICAgICAvLyBTdG9wIGFueSBjdXJyZW50IHJvbGxpbmdcclxuICAgICAgICBpZiAodGhpcy5yb2xsVGltZW91dCkge1xyXG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5yb2xsVGltZW91dCk7XHJcbiAgICAgICAgICAgIHRoaXMucm9sbFRpbWVvdXQgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmlzUm9sbGluZyA9IGZhbHNlO1xyXG5cclxuICAgICAgICAvLyBSZXNldCB0aGUgZHJhZ2dlZCBkaWNlIHBvc2l0aW9uIGZvciBkcmFnZ2luZ1xyXG4gICAgICAgIGNvbnN0IGJvZHkgPSB0aGlzLmRpY2VCb2R5QXJyYXlbaW5kZXhdO1xyXG4gICAgICAgIGJvZHkucG9zaXRpb24uc2V0KDAsIDIsIDApO1xyXG4gICAgICAgIGJvZHkudmVsb2NpdHkuc2V0KDAsIDAsIDApO1xyXG4gICAgICAgIGJvZHkuYW5ndWxhclZlbG9jaXR5LnNldCgwLCAwLCAwKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHN0YXJ0RHJhZ0FsbERpY2UoKTogdm9pZCB7XHJcbiAgICAgICAgdGhpcy5pc0RyYWdnaW5nID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmRyYWdnZWREaWNlSW5kZXggPSAtMTsgLy8gLTEgaW5kaWNhdGVzIGFsbCBkaWNlXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5kb21FbGVtZW50LnN0eWxlLmN1cnNvciA9ICdncmFiYmluZyc7XHJcblxyXG4gICAgICAgIC8vIEluaXRpYWxpemUgdmVsb2NpdHkgdHJhY2tpbmdcclxuICAgICAgICB0aGlzLmxhc3RNb3VzZVBvc2l0aW9uID0geyB4OiB0aGlzLmRyYWdTdGFydFBvc2l0aW9uLngsIHk6IHRoaXMuZHJhZ1N0YXJ0UG9zaXRpb24ueSwgdGltZTogRGF0ZS5ub3coKSB9O1xyXG4gICAgICAgIHRoaXMubW91c2VWZWxvY2l0eSA9IHsgeDogMCwgeTogMCB9O1xyXG5cclxuICAgICAgICAvLyBTdG9wIGFueSBjdXJyZW50IHJvbGxpbmdcclxuICAgICAgICBpZiAodGhpcy5yb2xsVGltZW91dCkge1xyXG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5yb2xsVGltZW91dCk7XHJcbiAgICAgICAgICAgIHRoaXMucm9sbFRpbWVvdXQgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmlzUm9sbGluZyA9IGZhbHNlO1xyXG5cclxuICAgICAgICAvLyBSZXNldCBhbGwgZGljZSBwb3NpdGlvbnMgZm9yIGRyYWdnaW5nXHJcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmRpY2VCb2R5QXJyYXkubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgYm9keSA9IHRoaXMuZGljZUJvZHlBcnJheVtpXTtcclxuICAgICAgICAgICAgY29uc3Qgc3ByZWFkID0gTWF0aC5zcXJ0KHRoaXMuZGljZUFycmF5Lmxlbmd0aCkgKiAxLjU7XHJcbiAgICAgICAgICAgIGNvbnN0IGFuZ2xlID0gKGkgLyB0aGlzLmRpY2VBcnJheS5sZW5ndGgpICogTWF0aC5QSSAqIDI7XHJcblxyXG4gICAgICAgICAgICAvLyBDbGVhciBoaWdobGlnaHQgYW5kIHJlc2V0IHN0YXRlIGlmIHRoaXMgZGljZSB3YXMgY2F1Z2h0XHJcbiAgICAgICAgICAgIGNvbnN0IHN0YXRlID0gdGhpcy5kaWNlU3RhdGVzW2ldO1xyXG4gICAgICAgICAgICBpZiAoc3RhdGUgJiYgc3RhdGUuaXNDYXVnaHQpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5SEIENsZWFyaW5nIGhpZ2hsaWdodCBmcm9tIGNhdWdodCBkaWNlICR7aX0gLSBkcmFnIGFsbGApO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5oaWdobGlnaHRDYXVnaHREaWNlKGksIGZhbHNlKTtcclxuICAgICAgICAgICAgICAgIHN0YXRlLmlzQ2F1Z2h0ID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICBzdGF0ZS5pc0NvbXBsZXRlID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICBzdGF0ZS5yZXN1bHQgPSBudWxsO1xyXG4gICAgICAgICAgICAgICAgc3RhdGUuc3RhYmxlVGltZSA9IDA7XHJcbiAgICAgICAgICAgICAgICBzdGF0ZS5pc1JvbGxpbmcgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgc3RhdGUubGFzdE1vdGlvbiA9IERhdGUubm93KCk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGJvZHkucG9zaXRpb24uc2V0KFxyXG4gICAgICAgICAgICAgICAgTWF0aC5jb3MoYW5nbGUpICogc3ByZWFkLFxyXG4gICAgICAgICAgICAgICAgMixcclxuICAgICAgICAgICAgICAgIE1hdGguc2luKGFuZ2xlKSAqIHNwcmVhZFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBib2R5LnZlbG9jaXR5LnNldCgwLCAwLCAwKTtcclxuICAgICAgICAgICAgYm9keS5hbmd1bGFyVmVsb2NpdHkuc2V0KDAsIDAsIDApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHVwZGF0ZURpY2VQb3NpdGlvbigpIHtcclxuICAgICAgICBpZiAoIXRoaXMuaXNEcmFnZ2luZykgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBGb3Igb3J0aG9ncmFwaGljIGNhbWVyYSwgY29udmVydCBtb3VzZSBjb29yZGluYXRlcyBkaXJlY3RseSB0byB3b3JsZCBjb29yZGluYXRlc1xyXG4gICAgICAgIGNvbnN0IGZydXN0dW1IZWlnaHQgPSB0aGlzLmNhbWVyYS50b3AgLSB0aGlzLmNhbWVyYS5ib3R0b207XHJcbiAgICAgICAgY29uc3QgZnJ1c3R1bVdpZHRoID0gdGhpcy5jYW1lcmEucmlnaHQgLSB0aGlzLmNhbWVyYS5sZWZ0O1xyXG5cclxuICAgICAgICAvLyBDb252ZXJ0IG5vcm1hbGl6ZWQgbW91c2UgY29vcmRpbmF0ZXMgdG8gd29ybGQgY29vcmRpbmF0ZXNcclxuICAgICAgICBjb25zdCB3b3JsZFggPSAodGhpcy5tb3VzZS54ICogZnJ1c3R1bVdpZHRoKSAvIDI7XHJcbiAgICAgICAgY29uc3Qgd29ybGRaID0gLSh0aGlzLm1vdXNlLnkgKiBmcnVzdHVtSGVpZ2h0KSAvIDI7IC8vIE5lZ2F0aXZlIGJlY2F1c2UgWSBpcyBmbGlwcGVkXHJcblxyXG4gICAgICAgIC8vIFNldCBwb3NpdGlvbiBhdCBkaWNlIHRyYXkgbGV2ZWwgKFkgPSAyKVxyXG4gICAgICAgIGNvbnN0IHdvcmxkUG9zaXRpb24gPSBuZXcgVEhSRUUuVmVjdG9yMyh3b3JsZFgsIDIsIHdvcmxkWik7XHJcblxyXG4gICAgICAgIC8vIENvbnN0cmFpbiB0byB0cmF5IGJvdW5kc1xyXG4gICAgICAgIHdvcmxkUG9zaXRpb24ueCA9IE1hdGgubWF4KC05LCBNYXRoLm1pbig5LCB3b3JsZFBvc2l0aW9uLngpKTtcclxuICAgICAgICB3b3JsZFBvc2l0aW9uLnogPSBNYXRoLm1heCgtNiwgTWF0aC5taW4oNiwgd29ybGRQb3NpdGlvbi56KSk7XHJcblxyXG4gICAgICAgIGlmICh0aGlzLmRyYWdnZWREaWNlSW5kZXggPT09IC0xKSB7XHJcbiAgICAgICAgICAgIC8vIERyYWcgYWxsIGRpY2UgLSBtYWludGFpbiByZWxhdGl2ZSBwb3NpdGlvbnNcclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmRpY2VCb2R5QXJyYXkubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGJvZHkgPSB0aGlzLmRpY2VCb2R5QXJyYXlbaV07XHJcbiAgICAgICAgICAgICAgICBjb25zdCBtZXNoID0gdGhpcy5kaWNlQXJyYXlbaV07XHJcblxyXG4gICAgICAgICAgICAgICAgYm9keS5wb3NpdGlvbi5jb3B5KHdvcmxkUG9zaXRpb24pO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIEFkZCBzbGlnaHQgc3ByZWFkIHRvIHByZXZlbnQgb3ZlcmxhcHBpbmdcclxuICAgICAgICAgICAgICAgIGNvbnN0IHNwcmVhZCA9IE1hdGguc3FydCh0aGlzLmRpY2VBcnJheS5sZW5ndGgpICogMC44O1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYW5nbGUgPSAoaSAvIHRoaXMuZGljZUFycmF5Lmxlbmd0aCkgKiBNYXRoLlBJICogMjtcclxuICAgICAgICAgICAgICAgIGJvZHkucG9zaXRpb24ueCArPSBNYXRoLmNvcyhhbmdsZSkgKiBzcHJlYWQ7XHJcbiAgICAgICAgICAgICAgICBib2R5LnBvc2l0aW9uLnogKz0gTWF0aC5zaW4oYW5nbGUpICogc3ByZWFkO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIEFkZCByb2xsaW5nIGFuaW1hdGlvbiB3aGlsZSBkcmFnZ2luZ1xyXG4gICAgICAgICAgICAgICAgbWVzaC5yb3RhdGlvbi54ICs9IDAuMDU7XHJcbiAgICAgICAgICAgICAgICBtZXNoLnJvdGF0aW9uLnkgKz0gMC4wNTtcclxuICAgICAgICAgICAgICAgIG1lc2gucm90YXRpb24ueiArPSAwLjAyNTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5kcmFnZ2VkRGljZUluZGV4ID49IDAgJiYgdGhpcy5kcmFnZ2VkRGljZUluZGV4IDwgdGhpcy5kaWNlQm9keUFycmF5Lmxlbmd0aCkge1xyXG4gICAgICAgICAgICAvLyBEcmFnIHNpbmdsZSBkaWNlXHJcbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSB0aGlzLmRpY2VCb2R5QXJyYXlbdGhpcy5kcmFnZ2VkRGljZUluZGV4XTtcclxuICAgICAgICAgICAgY29uc3QgbWVzaCA9IHRoaXMuZGljZUFycmF5W3RoaXMuZHJhZ2dlZERpY2VJbmRleF07XHJcblxyXG4gICAgICAgICAgICBib2R5LnBvc2l0aW9uLmNvcHkod29ybGRQb3NpdGlvbik7XHJcblxyXG4gICAgICAgICAgICAvLyBBZGQgcm9sbGluZyBhbmltYXRpb24gd2hpbGUgZHJhZ2dpbmdcclxuICAgICAgICAgICAgbWVzaC5yb3RhdGlvbi54ICs9IDAuMTtcclxuICAgICAgICAgICAgbWVzaC5yb3RhdGlvbi55ICs9IDAuMTtcclxuICAgICAgICAgICAgbWVzaC5yb3RhdGlvbi56ICs9IDAuMDU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgdGhyb3dEaWNlKGVuZFg6IG51bWJlciwgZW5kWTogbnVtYmVyKSB7XHJcbiAgICAgICAgdGhpcy5pc0RyYWdnaW5nID0gZmFsc2U7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5kb21FbGVtZW50LnN0eWxlLmN1cnNvciA9ICdkZWZhdWx0JztcclxuXHJcbiAgICAgICAgdGhpcy5pc1JvbGxpbmcgPSB0cnVlO1xyXG5cclxuICAgICAgICAvLyBUcmFjayB3aGljaCBkaWNlIHdlJ3JlIHJvbGxpbmcgKHNpbmdsZSBvciBhbGwpXHJcbiAgICAgICAgY29uc3Qgcm9sbGluZ1NpbmdsZURpY2UgPSB0aGlzLmRyYWdnZWREaWNlSW5kZXggPj0gMDtcclxuXHJcbiAgICAgICAgLy8gVXNlIG1vdXNlIHZlbG9jaXR5IGZvciByZWFsaXN0aWMgbW9tZW50dW0tYmFzZWQgdGhyb3dpbmdcclxuICAgICAgICBjb25zdCB2ZWxvY2l0eU11bHRpcGxpZXIgPSA1MDtcclxuICAgICAgICBjb25zdCBiYXNlVGhyb3dGb3JjZSA9IG5ldyBDQU5OT04uVmVjMyhcclxuICAgICAgICAgICAgdGhpcy5tb3VzZVZlbG9jaXR5LnggKiB2ZWxvY2l0eU11bHRpcGxpZXIsXHJcbiAgICAgICAgICAgIC1NYXRoLm1heChNYXRoLmFicyh0aGlzLm1vdXNlVmVsb2NpdHkueCArIHRoaXMubW91c2VWZWxvY2l0eS55KSAqIHZlbG9jaXR5TXVsdGlwbGllciAqIDAuNSwgMyksXHJcbiAgICAgICAgICAgIHRoaXMubW91c2VWZWxvY2l0eS55ICogdmVsb2NpdHlNdWx0aXBsaWVyXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy8gQ2FwIG1heGltdW0gZm9yY2UgdG8gcHJldmVudCBkaWNlIGZyb20gZmx5aW5nIHRvbyBmYXJcclxuICAgICAgICBjb25zdCBtYXhGb3JjZSA9IDI1O1xyXG4gICAgICAgIGNvbnN0IGZvcmNlTGVuZ3RoID0gYmFzZVRocm93Rm9yY2UubGVuZ3RoKCk7XHJcbiAgICAgICAgaWYgKGZvcmNlTGVuZ3RoID4gbWF4Rm9yY2UpIHtcclxuICAgICAgICAgICAgYmFzZVRocm93Rm9yY2Uuc2NhbGUobWF4Rm9yY2UgLyBmb3JjZUxlbmd0aCwgYmFzZVRocm93Rm9yY2UpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQXBwbHkgdGhyb3dpbmcgZm9yY2UgdG8gdGhlIGFwcHJvcHJpYXRlIGRpY2VcclxuICAgICAgICBpZiAodGhpcy5kcmFnZ2VkRGljZUluZGV4ID09PSAtMSkge1xyXG4gICAgICAgICAgICAvLyBUaHJvdyBhbGwgZGljZVxyXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuZGljZUJvZHlBcnJheS5sZW5ndGg7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYm9keSA9IHRoaXMuZGljZUJvZHlBcnJheVtpXTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBBZGQgc29tZSByYW5kb21uZXNzIGZvciBlYWNoIGRpY2VcclxuICAgICAgICAgICAgICAgIGNvbnN0IHRocm93Rm9yY2UgPSBiYXNlVGhyb3dGb3JjZS5jbG9uZSgpO1xyXG4gICAgICAgICAgICAgICAgdGhyb3dGb3JjZS54ICs9IChNYXRoLnJhbmRvbSgpIC0gMC41KSAqIDU7XHJcbiAgICAgICAgICAgICAgICB0aHJvd0ZvcmNlLnogKz0gKE1hdGgucmFuZG9tKCkgLSAwLjUpICogNTtcclxuXHJcbiAgICAgICAgICAgICAgICBib2R5LnZlbG9jaXR5LmNvcHkodGhyb3dGb3JjZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgc3BpbiBiYXNlZCBvbiB2ZWxvY2l0eSBkaXJlY3Rpb24gYW5kIG1hZ25pdHVkZVxyXG4gICAgICAgICAgICAgICAgY29uc3Qgc3BpbkludGVuc2l0eSA9IE1hdGgubWluKE1hdGguc3FydCh0aGlzLm1vdXNlVmVsb2NpdHkueCAqIHRoaXMubW91c2VWZWxvY2l0eS54ICsgdGhpcy5tb3VzZVZlbG9jaXR5LnkgKiB0aGlzLm1vdXNlVmVsb2NpdHkueSkgKiAxMDAsIDI1KTtcclxuICAgICAgICAgICAgICAgIGJvZHkuYW5ndWxhclZlbG9jaXR5LnNldChcclxuICAgICAgICAgICAgICAgICAgICAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiBzcGluSW50ZW5zaXR5ICsgdGhpcy5tb3VzZVZlbG9jaXR5LnkgKiAxMCxcclxuICAgICAgICAgICAgICAgICAgICAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiBzcGluSW50ZW5zaXR5LFxyXG4gICAgICAgICAgICAgICAgICAgIChNYXRoLnJhbmRvbSgpIC0gMC41KSAqIHNwaW5JbnRlbnNpdHkgKyB0aGlzLm1vdXNlVmVsb2NpdHkueCAqIDEwXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmRyYWdnZWREaWNlSW5kZXggPj0gMCAmJiB0aGlzLmRyYWdnZWREaWNlSW5kZXggPCB0aGlzLmRpY2VCb2R5QXJyYXkubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIC8vIFRocm93IHNpbmdsZSBkaWNlXHJcbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSB0aGlzLmRpY2VCb2R5QXJyYXlbdGhpcy5kcmFnZ2VkRGljZUluZGV4XTtcclxuICAgICAgICAgICAgYm9keS52ZWxvY2l0eS5jb3B5KGJhc2VUaHJvd0ZvcmNlKTtcclxuXHJcbiAgICAgICAgICAgIC8vIEFwcGx5IHNwaW4gYmFzZWQgb24gdmVsb2NpdHkgZGlyZWN0aW9uIGFuZCBtYWduaXR1ZGVcclxuICAgICAgICAgICAgY29uc3Qgc3BpbkludGVuc2l0eSA9IE1hdGgubWluKE1hdGguc3FydCh0aGlzLm1vdXNlVmVsb2NpdHkueCAqIHRoaXMubW91c2VWZWxvY2l0eS54ICsgdGhpcy5tb3VzZVZlbG9jaXR5LnkgKiB0aGlzLm1vdXNlVmVsb2NpdHkueSkgKiAxMDAsIDI1KTtcclxuICAgICAgICAgICAgYm9keS5hbmd1bGFyVmVsb2NpdHkuc2V0KFxyXG4gICAgICAgICAgICAgICAgKE1hdGgucmFuZG9tKCkgLSAwLjUpICogc3BpbkludGVuc2l0eSArIHRoaXMubW91c2VWZWxvY2l0eS55ICogMTAsXHJcbiAgICAgICAgICAgICAgICAoTWF0aC5yYW5kb20oKSAtIDAuNSkgKiBzcGluSW50ZW5zaXR5LFxyXG4gICAgICAgICAgICAgICAgKE1hdGgucmFuZG9tKCkgLSAwLjUpICogc3BpbkludGVuc2l0eSArIHRoaXMubW91c2VWZWxvY2l0eS54ICogMTBcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFN0b3JlIHdoaWNoIGRpY2Ugd2FzIHJvbGxlZCBiZWZvcmUgcmVzZXR0aW5nXHJcbiAgICAgICAgY29uc3Qgcm9sbGVkRGljZUluZGV4ID0gdGhpcy5kcmFnZ2VkRGljZUluZGV4O1xyXG5cclxuICAgICAgICAvLyBSZXNldCBkcmFnZ2VkIGRpY2UgaW5kZXhcclxuICAgICAgICB0aGlzLmRyYWdnZWREaWNlSW5kZXggPSAtMTtcclxuXHJcbiAgICAgICAgLy8gU3RhcnQgY2hlY2tpbmcgZm9yIHNldHRsaW5nIGJhc2VkIG9uIHdoYXQgd2FzIHJvbGxlZFxyXG4gICAgICAgIGlmIChyb2xsaW5nU2luZ2xlRGljZSkge1xyXG4gICAgICAgICAgICAvLyBDaGVjayBpZiB0aGlzIGlzIHBhcnQgb2YgYW4gYWN0aXZlIGdyb3VwIHJvbGwgKG1vbml0b3JpbmcgaXMgc3RpbGwgcnVubmluZylcclxuICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudE1vbml0b3IgIT09IG51bGwgJiYgdGhpcy5kaWNlU3RhdGVzLmxlbmd0aCA+IDAgJiYgcm9sbGVkRGljZUluZGV4IDwgdGhpcy5kaWNlU3RhdGVzLmxlbmd0aCkge1xyXG4gICAgICAgICAgICAgICAgLy8gVGhpcyBpcyBhIHJlcm9sbCBvZiBhIGNhdWdodCBkaWNlIGZyb20gYSBncm91cCByb2xsIC0ganVzdCByZXNldCBpdHMgc3RhdGVcclxuICAgICAgICAgICAgICAgIGNvbnN0IHN0YXRlID0gdGhpcy5kaWNlU3RhdGVzW3JvbGxlZERpY2VJbmRleF07XHJcbiAgICAgICAgICAgICAgICBzdGF0ZS5pc1JvbGxpbmcgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgc3RhdGUuaXNDYXVnaHQgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIHN0YXRlLmlzQ29tcGxldGUgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIHN0YXRlLnJlc3VsdCA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICBzdGF0ZS5zdGFibGVUaW1lID0gMDtcclxuICAgICAgICAgICAgICAgIHN0YXRlLmxhc3RNb3Rpb24gPSBEYXRlLm5vdygpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYPCflIQgUmVyb2xsaW5nIGRpY2UgJHtyb2xsZWREaWNlSW5kZXh9IGFzIHBhcnQgb2YgYWN0aXZlIGdyb3VwIHJvbGwgLSBzdGF0ZSByZXNldGApO1xyXG4gICAgICAgICAgICAgICAgLy8gRG9uJ3QgY2FsbCBjaGVja1NpbmdsZURpY2VTZXR0bGluZyAtIGxldCB0aGUgZ3JvdXAgbW9uaXRvciBoYW5kbGUgaXRcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIC8vIFRydWUgc2luZ2xlIGRpY2Ugcm9sbCAtIGNoZWNrIG9ubHkgdGhhdCBkaWNlXHJcbiAgICAgICAgICAgICAgICB0aGlzLmNoZWNrU2luZ2xlRGljZVNldHRsaW5nKHJvbGxlZERpY2VJbmRleCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBNdWx0aXBsZSBkaWNlIC0gdXNlIGVuaGFuY2VkIG1vbml0b3Jpbmcgd2l0aCBjYXRjaGluZyBkZXRlY3Rpb25cclxuICAgICAgICAgICAgdGhpcy5pbml0aWFsaXplRGljZVN0YXRlcygpO1xyXG4gICAgICAgICAgICAvLyBOb3RlOiBGb3JjZXMgYWxyZWFkeSBhcHBsaWVkIGFib3ZlLCBqdXN0IHN0YXJ0IG1vbml0b3JpbmdcclxuICAgICAgICAgICAgdGhpcy5zdGFydEluZGl2aWR1YWxEaWNlTW9uaXRvcmluZyhcclxuICAgICAgICAgICAgICAgIChyZXN1bHQpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBPbiBjb21wbGV0aW9uLCB0cmlnZ2VyIGNhbGxiYWNrXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMub25Sb2xsQ29tcGxldGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5vblJvbGxDb21wbGV0ZShyZXN1bHQpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmlzUm9sbGluZyA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIChlcnJvcikgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1Rocm93IG1vbml0b3JpbmcgZXJyb3I6JywgZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaXNSb2xsaW5nID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTZXQgdGltZW91dCBmb3IgZm9yY2Ugc3RvcFxyXG4gICAgICAgIGNvbnN0IGJhc2VUaW1lb3V0ID0gNjAwMDtcclxuICAgICAgICBjb25zdCBleHRlbmRlZFRpbWVvdXQgPSBiYXNlVGltZW91dCArICh0aGlzLnNldHRpbmdzLm1vdGlvblRocmVzaG9sZCAqIDEwMDApO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGDwn5WQIFRocm93IHRpbWVvdXQgc2V0IHRvICR7ZXh0ZW5kZWRUaW1lb3V0fW1zYCk7XHJcblxyXG4gICAgICAgIHRoaXMucm9sbFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcclxuICAgICAgICAgICAgaWYgKHJvbGxpbmdTaW5nbGVEaWNlKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLmNvbXBsZXRlU2luZ2xlRGljZVJvbGwocm9sbGVkRGljZUluZGV4KTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIHRoaXMuZm9yY2VTdG9wTXVsdGlSb2xsKCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LCBleHRlbmRlZFRpbWVvdXQpO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgZm9yY2VTdG9wKCkge1xyXG4gICAgICAgIGlmICh0aGlzLnJvbGxUaW1lb3V0KSB7XHJcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnJvbGxUaW1lb3V0KTtcclxuICAgICAgICAgICAgdGhpcy5yb2xsVGltZW91dCA9IG51bGw7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zb2xlLmxvZygnRm9yY2Ugc3RvcHBpbmcgZGljZSByb2xsJyk7XHJcbiAgICAgICAgdGhpcy5pc1JvbGxpbmcgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgY29uc3QgY2FudmFzID0gdGhpcy5yZW5kZXJlci5kb21FbGVtZW50O1xyXG4gICAgICAgIGNhbnZhcy5zdHlsZS5jdXJzb3IgPSAnZGVmYXVsdCc7XHJcblxyXG4gICAgICAgIHRoaXMuZGljZUJvZHkudmVsb2NpdHkuc2V0KDAsIDAsIDApO1xyXG4gICAgICAgIHRoaXMuZGljZUJvZHkuYW5ndWxhclZlbG9jaXR5LnNldCgwLCAwLCAwKTtcclxuXHJcbiAgICAgICAgdGhpcy5jYWxjdWxhdGVSZXN1bHQoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGFuaW1hdGUoKSB7XHJcbiAgICAgICAgdGhpcy5hbmltYXRpb25JZCA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB0aGlzLmFuaW1hdGUoKSk7XHJcblxyXG4gICAgICAgIC8vIFN0ZXAgcGh5c2ljcyBzaW11bGF0aW9uIHdpdGggZml4ZWQgdGltZXN0ZXAgZm9yIGNvbnNpc3RlbmN5XHJcbiAgICAgICAgdGhpcy53b3JsZC5zdGVwKDEvNjApO1xyXG5cclxuICAgICAgICAvLyBEZWJ1ZzogQ2hlY2sgcGh5c2ljcyB2YWx1ZXMgb2NjYXNpb25hbGx5XHJcbiAgICAgICAgaWYgKHRoaXMuaXNSb2xsaW5nICYmIE1hdGgucmFuZG9tKCkgPCAwLjAxKSB7IC8vIDElIGNoYW5jZVxyXG4gICAgICAgICAgICBpZiAodGhpcy5kaWNlQm9keUFycmF5Lmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGJvZHkgPSB0aGlzLmRpY2VCb2R5QXJyYXlbMF07XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+OryBQaHlzaWNzIGRlYnVnOiB2ZWw9JHtib2R5LnZlbG9jaXR5Lmxlbmd0aCgpLnRvRml4ZWQoMyl9LCBhbmdWZWw9JHtib2R5LmFuZ3VsYXJWZWxvY2l0eS5sZW5ndGgoKS50b0ZpeGVkKDMpfSwgZGFtcGluZzogbGluZWFyPSR7Ym9keS5saW5lYXJEYW1waW5nfSwgYW5ndWxhcj0ke2JvZHkuYW5ndWxhckRhbXBpbmd9LCB3b3JsZEJvZGllczogJHt0aGlzLndvcmxkLmJvZGllcy5sZW5ndGh9LCB0aW1lOiAke3RoaXMud29ybGQudGltZS50b0ZpeGVkKDIpfWApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBVcGRhdGUgYWxsIGRpY2UgdmlzdWFsIHBvc2l0aW9ucyBmcm9tIHBoeXNpY3MgYm9kaWVzICh1bmxlc3Mgc2hvd2luZyByZXN1bHQgYW5pbWF0aW9uKVxyXG4gICAgICAgIGlmICghdGhpcy5zaG93aW5nUmVzdWx0KSB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5kaWNlQXJyYXkubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGRpY2UgPSB0aGlzLmRpY2VBcnJheVtpXTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGJvZHkgPSB0aGlzLmRpY2VCb2R5QXJyYXlbaV07XHJcbiAgICAgICAgICAgICAgICBpZiAoZGljZSAmJiBib2R5KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZGljZS5wb3NpdGlvbi5jb3B5KGJvZHkucG9zaXRpb24gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgICAgICBkaWNlLnF1YXRlcm5pb24uY29weShib2R5LnF1YXRlcm5pb24gYXMgYW55KTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gTm90ZTogSG92ZXIgY2lyY2xlIGZ1bmN0aW9uYWxpdHkgZGlzYWJsZWQgZm9yIG11bHRpLWRpY2Ugc3lzdGVtXHJcblxyXG4gICAgICAgIC8vIE5vdGU6IFJvbGxpbmcgZGV0ZWN0aW9uIHNpbXBsaWZpZWQgZm9yIG11bHRpLWRpY2Ugc3lzdGVtXHJcbiAgICAgICAgLy8gSW5kaXZpZHVhbCBkaWNlIHJvbGxpbmcgbG9naWMgd2lsbCBiZSBpbXBsZW1lbnRlZCBpbiBmdXR1cmUgcGhhc2VzXHJcblxyXG4gICAgICAgIHRoaXMucmVuZGVyZXIucmVuZGVyKHRoaXMuc2NlbmUsIHRoaXMuY2FtZXJhKTtcclxuICAgIH1cclxuXHJcblxyXG4gICAgLy8gT2xkIHJvbGwgbWV0aG9kIHJlbW92ZWQgLSByZXBsYWNlZCBieSBlbmhhbmNlZCByb2xsIG1ldGhvZCB3aXRoIGluZGl2aWR1YWwgZGljZSB0cmFja2luZ1xyXG5cclxuICAgIHByaXZhdGUgcm9sbFJlc29sdmU6ICgodmFsdWU6IG51bWJlcikgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcclxuICAgIHByaXZhdGUgbXVsdGlSb2xsUmVzb2x2ZTogKCh2YWx1ZTogc3RyaW5nKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSByb2xsVGltZW91dElkOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBzaG93aW5nUmVzdWx0ID0gZmFsc2U7XHJcblxyXG4gICAgcHJpdmF0ZSBjYWxjdWxhdGVSZXN1bHQoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gdGhpcy5nZXRUb3BGYWNlTnVtYmVyKCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYE5hdHVyYWwgZGljZSByZXN1bHQ6ICR7cmVzdWx0fWApO1xyXG5cclxuICAgICAgICAvLyBTbmFwIGJlaGF2aW9yIHJlbW92ZWQgLSBVViBtYXBwaW5nIGhhbmRsZXMgcHJvcGVyIGZhY2UgZGlzcGxheVxyXG5cclxuICAgICAgICBpZiAodGhpcy5vblJvbGxDb21wbGV0ZSkge1xyXG4gICAgICAgICAgICB0aGlzLm9uUm9sbENvbXBsZXRlKHJlc3VsdCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAodGhpcy5yb2xsUmVzb2x2ZSkge1xyXG4gICAgICAgICAgICB0aGlzLnJvbGxSZXNvbHZlKHJlc3VsdCk7XHJcbiAgICAgICAgICAgIHRoaXMucm9sbFJlc29sdmUgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcblxyXG5cclxuICAgIHByaXZhdGUgY2FsY3VsYXRlUm90YXRpb25Gb3JUb3BGYWNlKHRhcmdldEZhY2VOdW1iZXI6IG51bWJlcik6IFRIUkVFLkV1bGVyIHtcclxuICAgICAgICAvLyBVc2UgdGhlIGFjY3VyYXRlIEV1bGVyIHJvdGF0aW9ucyBjYXB0dXJlZCBmb3IgZWFjaCBmYWNlXHJcbiAgICAgICAgY29uc3QgZmFjZVJvdGF0aW9uczogeyBba2V5OiBudW1iZXJdOiBUSFJFRS5FdWxlciB9ID0ge1xyXG4gICAgICAgICAgICAxOiBuZXcgVEhSRUUuRXVsZXIoLTEuNywgLTAuOSwgLTIuNSksXHJcbiAgICAgICAgICAgIDI6IG5ldyBUSFJFRS5FdWxlcigtMC4wLCAtMC41LCAyLjApLFxyXG4gICAgICAgICAgICAzOiBuZXcgVEhSRUUuRXVsZXIoMC4wMCwgLTAuMjgsIC0xLjk0KSxcclxuICAgICAgICAgICAgNDogbmV3IFRIUkVFLkV1bGVyKC0wLjUsIC0yLjgsIDAuNiksXHJcbiAgICAgICAgICAgIDU6IG5ldyBUSFJFRS5FdWxlcigtMC44OSwgLTAuNzMsIDAuMTApLFxyXG4gICAgICAgICAgICA2OiBuZXcgVEhSRUUuRXVsZXIoMS4yNCwgMC4xNywgLTIuMDIpLFxyXG4gICAgICAgICAgICA3OiBuZXcgVEhSRUUuRXVsZXIoLTEuMiwgMC4xLCAtMS41KSxcclxuICAgICAgICAgICAgODogbmV3IFRIUkVFLkV1bGVyKC0wLjcsIDIuMiwgLTIuNSksXHJcbiAgICAgICAgICAgIDk6IG5ldyBUSFJFRS5FdWxlcigyLjQ3LCAtMC4zOSwgMi4wNiksXHJcbiAgICAgICAgICAgIDEwOiBuZXcgVEhSRUUuRXVsZXIoLTIuOCwgMC4xLCAwLjEpLFxyXG4gICAgICAgICAgICAxMTogbmV3IFRIUkVFLkV1bGVyKDAuMzksIC0wLjMzLCAwLjEzKSxcclxuICAgICAgICAgICAgMTI6IG5ldyBUSFJFRS5FdWxlcigtMC45NSwgMC43OCwgMy4xNCksXHJcbiAgICAgICAgICAgIDEzOiBuZXcgVEhSRUUuRXVsZXIoLTIuNiwgLTAuMCwgLTMuMSksXHJcbiAgICAgICAgICAgIDE0OiBuZXcgVEhSRUUuRXVsZXIoMS41MSwgMC4zNiwgMC4xOCksXHJcbiAgICAgICAgICAgIDE1OiBuZXcgVEhSRUUuRXVsZXIoLTEuMiwgLTAuMCwgMS42KSxcclxuICAgICAgICAgICAgMTY6IG5ldyBUSFJFRS5FdWxlcigwLjk4LCAwLjgyLCAzLjExKSxcclxuICAgICAgICAgICAgMTc6IG5ldyBUSFJFRS5FdWxlcigtMi40NSwgLTAuNDUsIDEuMTMpLFxyXG4gICAgICAgICAgICAxODogbmV3IFRIUkVFLkV1bGVyKC0wLjAsIDAuNiwgMS4yKSxcclxuICAgICAgICAgICAgMTk6IG5ldyBUSFJFRS5FdWxlcigtMC4wLCAtMC41LCAtMS4yKSxcclxuICAgICAgICAgICAgMjA6IG5ldyBUSFJFRS5FdWxlcigtMi40LCAyLjcsIC0xLjIpXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgY29uc3QgdGFyZ2V0Um90YXRpb24gPSBmYWNlUm90YXRpb25zW3RhcmdldEZhY2VOdW1iZXJdO1xyXG5cclxuICAgICAgICBpZiAodGFyZ2V0Um90YXRpb24pIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYFVzaW5nIGNhbGlicmF0ZWQgcm90YXRpb24gZm9yIGZhY2UgJHt0YXJnZXRGYWNlTnVtYmVyfTpgLCB0YXJnZXRSb3RhdGlvbik7XHJcbiAgICAgICAgICAgIHJldHVybiB0YXJnZXRSb3RhdGlvbjtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYE5vIGNhbGlicmF0ZWQgcm90YXRpb24gZm91bmQgZm9yIGZhY2UgJHt0YXJnZXRGYWNlTnVtYmVyfSwgdXNpbmcgZGVmYXVsdGApO1xyXG4gICAgICAgICAgICByZXR1cm4gbmV3IFRIUkVFLkV1bGVyKDAsIDAsIDApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgZGVidWdQaHlzaWNzKCk6IHZvaWQge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCfinYwgTGVnYWN5IGRlYnVnUGh5c2ljcygpIGRpc2FibGVkIGZvciBtdWx0aS1kaWNlIHN5c3RlbScpO1xyXG4gICAgICAgIHJldHVybjtcclxuXHJcbiAgICAgICAgY29uc29sZS5ncm91cCgn8J+OsiBESUNFIFBIWVNJQ1MgREVCVUcnKTtcclxuXHJcbiAgICAgICAgLy8gQ3VycmVudCBkZXRlY3RlZCBmYWNlXHJcbiAgICAgICAgY29uc3QgZGV0ZWN0ZWRGYWNlID0gdGhpcy5nZXRUb3BGYWNlTnVtYmVyKCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYPCfjq8gRGV0ZWN0ZWQgRmFjZTogJHtkZXRlY3RlZEZhY2V9YCk7XHJcblxyXG4gICAgICAgIC8vIFBoeXNpY3MgYm9keSBwcm9wZXJ0aWVzXHJcbiAgICAgICAgY29uc29sZS5ncm91cCgn4pqZ77iPIFBoeXNpY3MgQm9keScpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBQb3NpdGlvbjogKCR7dGhpcy5kaWNlQm9keS5wb3NpdGlvbi54LnRvRml4ZWQoMyl9LCAke3RoaXMuZGljZUJvZHkucG9zaXRpb24ueS50b0ZpeGVkKDMpfSwgJHt0aGlzLmRpY2VCb2R5LnBvc2l0aW9uLnoudG9GaXhlZCgzKX0pYCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYFZlbG9jaXR5OiAoJHt0aGlzLmRpY2VCb2R5LnZlbG9jaXR5LngudG9GaXhlZCgzKX0sICR7dGhpcy5kaWNlQm9keS52ZWxvY2l0eS55LnRvRml4ZWQoMyl9LCAke3RoaXMuZGljZUJvZHkudmVsb2NpdHkuei50b0ZpeGVkKDMpfSlgKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgTGluZWFyIFNwZWVkOiAke3RoaXMuZGljZUJvZHkudmVsb2NpdHkubGVuZ3RoKCkudG9GaXhlZCgzKX0gbS9zYCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYEFuZ3VsYXIgVmVsb2NpdHk6ICgke3RoaXMuZGljZUJvZHkuYW5ndWxhclZlbG9jaXR5LngudG9GaXhlZCgzKX0sICR7dGhpcy5kaWNlQm9keS5hbmd1bGFyVmVsb2NpdHkueS50b0ZpeGVkKDMpfSwgJHt0aGlzLmRpY2VCb2R5LmFuZ3VsYXJWZWxvY2l0eS56LnRvRml4ZWQoMyl9KWApO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBBbmd1bGFyIFNwZWVkOiAke3RoaXMuZGljZUJvZHkuYW5ndWxhclZlbG9jaXR5Lmxlbmd0aCgpLnRvRml4ZWQoMyl9IHJhZC9zYCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYE1hc3M6ICR7dGhpcy5kaWNlQm9keS5tYXNzfSBrZ2ApO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBUeXBlOiAke3RoaXMuZGljZUJvZHkudHlwZSA9PT0gQ0FOTk9OLkJvZHkuRFlOQU1JQyA/ICdEWU5BTUlDJyA6IHRoaXMuZGljZUJvZHkudHlwZSA9PT0gQ0FOTk9OLkJvZHkuU1RBVElDID8gJ1NUQVRJQycgOiAnS0lORU1BVElDJ31gKTtcclxuICAgICAgICBjb25zb2xlLmdyb3VwRW5kKCk7XHJcblxyXG4gICAgICAgIC8vIFZpc3VhbCBtZXNoIHByb3BlcnRpZXNcclxuICAgICAgICBjb25zb2xlLmdyb3VwKCfwn5GB77iPIFZpc3VhbCBNZXNoJyk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYFJvdGF0aW9uIChFdWxlcik6ICgke3RoaXMuZGljZS5yb3RhdGlvbi54LnRvRml4ZWQoMyl9LCAke3RoaXMuZGljZS5yb3RhdGlvbi55LnRvRml4ZWQoMyl9LCAke3RoaXMuZGljZS5yb3RhdGlvbi56LnRvRml4ZWQoMyl9KWApO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBQb3NpdGlvbjogKCR7dGhpcy5kaWNlLnBvc2l0aW9uLngudG9GaXhlZCgzKX0sICR7dGhpcy5kaWNlLnBvc2l0aW9uLnkudG9GaXhlZCgzKX0sICR7dGhpcy5kaWNlLnBvc2l0aW9uLnoudG9GaXhlZCgzKX0pYCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYFNjYWxlOiAoJHt0aGlzLmRpY2Uuc2NhbGUueC50b0ZpeGVkKDMpfSwgJHt0aGlzLmRpY2Uuc2NhbGUueS50b0ZpeGVkKDMpfSwgJHt0aGlzLmRpY2Uuc2NhbGUuei50b0ZpeGVkKDMpfSlgKTtcclxuICAgICAgICBjb25zb2xlLmdyb3VwRW5kKCk7XHJcblxyXG4gICAgICAgIC8vIFBoeXNpY3MgcXVhdGVybmlvbiB2cyBFdWxlciBjb21wYXJpc29uXHJcbiAgICAgICAgY29uc29sZS5ncm91cCgn8J+UhCBSb3RhdGlvbiBBbmFseXNpcycpO1xyXG4gICAgICAgIGNvbnN0IHBoeXNpY3NRdWF0ID0gdGhpcy5kaWNlQm9keS5xdWF0ZXJuaW9uO1xyXG4gICAgICAgIGNvbnN0IHZpc3VhbEV1bGVyID0gdGhpcy5kaWNlLnJvdGF0aW9uO1xyXG4gICAgICAgIGNvbnN0IHBoeXNpY3NFdWxlciA9IG5ldyBUSFJFRS5FdWxlcigpLnNldEZyb21RdWF0ZXJuaW9uKFxyXG4gICAgICAgICAgICBuZXcgVEhSRUUuUXVhdGVybmlvbihwaHlzaWNzUXVhdC54LCBwaHlzaWNzUXVhdC55LCBwaHlzaWNzUXVhdC56LCBwaHlzaWNzUXVhdC53KVxyXG4gICAgICAgICk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYFBoeXNpY3MgUXVhdGVybmlvbjogKCR7cGh5c2ljc1F1YXQueC50b0ZpeGVkKDMpfSwgJHtwaHlzaWNzUXVhdC55LnRvRml4ZWQoMyl9LCAke3BoeXNpY3NRdWF0LnoudG9GaXhlZCgzKX0sICR7cGh5c2ljc1F1YXQudy50b0ZpeGVkKDMpfSlgKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgUGh5c2ljcyBhcyBFdWxlcjogKCR7cGh5c2ljc0V1bGVyLngudG9GaXhlZCgzKX0sICR7cGh5c2ljc0V1bGVyLnkudG9GaXhlZCgzKX0sICR7cGh5c2ljc0V1bGVyLnoudG9GaXhlZCgzKX0pYCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coYFZpc3VhbCBFdWxlcjogKCR7dmlzdWFsRXVsZXIueC50b0ZpeGVkKDMpfSwgJHt2aXN1YWxFdWxlci55LnRvRml4ZWQoMyl9LCAke3Zpc3VhbEV1bGVyLnoudG9GaXhlZCgzKX0pYCk7XHJcbiAgICAgICAgY29uc29sZS5ncm91cEVuZCgpO1xyXG5cclxuICAgICAgICAvLyBNYXRlcmlhbCBwcm9wZXJ0aWVzXHJcbiAgICAgICAgY29uc29sZS5ncm91cCgn8J+nqiBNYXRlcmlhbCBQcm9wZXJ0aWVzJyk7XHJcbiAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSB0aGlzLmRpY2VCb2R5Lm1hdGVyaWFsO1xyXG4gICAgICAgIGlmIChtYXRlcmlhbCkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgRnJpY3Rpb246ICR7bWF0ZXJpYWwuZnJpY3Rpb259YCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBSZXN0aXR1dGlvbjogJHttYXRlcmlhbC5yZXN0aXR1dGlvbn1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc29sZS5sb2coYExpbmVhciBEYW1waW5nOiAke3RoaXMuZGljZUJvZHkubGluZWFyRGFtcGluZ31gKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgQW5ndWxhciBEYW1waW5nOiAke3RoaXMuZGljZUJvZHkuYW5ndWxhckRhbXBpbmd9YCk7XHJcbiAgICAgICAgY29uc29sZS5ncm91cEVuZCgpO1xyXG5cclxuICAgICAgICAvLyBTdGF0ZSBmbGFnc1xyXG4gICAgICAgIGNvbnNvbGUuZ3JvdXAoJ/Cfj4MgU3RhdGUgRmxhZ3MnKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgSXMgUm9sbGluZzogJHt0aGlzLmlzUm9sbGluZ31gKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhgSXMgRHJhZ2dpbmc6ICR7dGhpcy5pc0RyYWdnaW5nfWApO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBTaG93aW5nIFJlc3VsdDogJHt0aGlzLnNob3dpbmdSZXN1bHR9YCk7XHJcbiAgICAgICAgY29uc29sZS5ncm91cEVuZCgpO1xyXG5cclxuICAgICAgICAvLyBGYWNlIGRldGVjdGlvbiBkaXN0YW5jZXMgKGZvciBkZWJ1Z2dpbmcgZmFjZSBkZXRlY3Rpb24gYWNjdXJhY3kpXHJcbiAgICAgICAgY29uc29sZS5ncm91cCgn8J+TiiBGYWNlIERldGVjdGlvbiBBbmFseXNpcycpO1xyXG4gICAgICAgIHRoaXMuZGVidWdGYWNlRGV0ZWN0aW9uRGlzdGFuY2VzKCk7XHJcbiAgICAgICAgY29uc29sZS5ncm91cEVuZCgpO1xyXG5cclxuICAgICAgICBjb25zb2xlLmdyb3VwRW5kKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBkZWJ1Z0ZhY2VEZXRlY3Rpb25EaXN0YW5jZXMoKTogdm9pZCB7XHJcbiAgICAgICAgY29uc3QgY3VycmVudFJvdGF0aW9uID0gdGhpcy5kaWNlLnJvdGF0aW9uO1xyXG5cclxuICAgICAgICBjb25zdCBmYWNlUm90YXRpb25zOiB7IFtrZXk6IG51bWJlcl06IFRIUkVFLkV1bGVyIH0gPSB7XHJcbiAgICAgICAgICAgIDE6IG5ldyBUSFJFRS5FdWxlcigtMS43LCAtMC45LCAtMi41KSxcclxuICAgICAgICAgICAgMjogbmV3IFRIUkVFLkV1bGVyKC0wLjAsIC0wLjUsIDIuMCksXHJcbiAgICAgICAgICAgIDM6IG5ldyBUSFJFRS5FdWxlcigwLjAwLCAtMC4yOCwgLTEuOTQpLFxyXG4gICAgICAgICAgICA0OiBuZXcgVEhSRUUuRXVsZXIoLTAuNSwgLTIuOCwgMC42KSxcclxuICAgICAgICAgICAgNTogbmV3IFRIUkVFLkV1bGVyKC0wLjg5LCAtMC43MywgMC4xMCksXHJcbiAgICAgICAgICAgIDY6IG5ldyBUSFJFRS5FdWxlcigxLjI0LCAwLjE3LCAtMi4wMiksXHJcbiAgICAgICAgICAgIDc6IG5ldyBUSFJFRS5FdWxlcigtMS4yLCAwLjEsIC0xLjUpLFxyXG4gICAgICAgICAgICA4OiBuZXcgVEhSRUUuRXVsZXIoLTAuNywgMi4yLCAtMi41KSxcclxuICAgICAgICAgICAgOTogbmV3IFRIUkVFLkV1bGVyKDIuNDcsIC0wLjM5LCAyLjA2KSxcclxuICAgICAgICAgICAgMTA6IG5ldyBUSFJFRS5FdWxlcigtMi44LCAwLjEsIDAuMSksXHJcbiAgICAgICAgICAgIDExOiBuZXcgVEhSRUUuRXVsZXIoMC4zOSwgLTAuMzMsIDAuMTMpLFxyXG4gICAgICAgICAgICAxMjogbmV3IFRIUkVFLkV1bGVyKC0wLjk1LCAwLjc4LCAzLjE0KSxcclxuICAgICAgICAgICAgMTM6IG5ldyBUSFJFRS5FdWxlcigtMi42LCAtMC4wLCAtMy4xKSxcclxuICAgICAgICAgICAgMTQ6IG5ldyBUSFJFRS5FdWxlcigxLjUxLCAwLjM2LCAwLjE4KSxcclxuICAgICAgICAgICAgMTU6IG5ldyBUSFJFRS5FdWxlcigtMS4yLCAtMC4wLCAxLjYpLFxyXG4gICAgICAgICAgICAxNjogbmV3IFRIUkVFLkV1bGVyKDAuOTgsIDAuODIsIDMuMTEpLFxyXG4gICAgICAgICAgICAxNzogbmV3IFRIUkVFLkV1bGVyKC0yLjQ1LCAtMC40NSwgMS4xMyksXHJcbiAgICAgICAgICAgIDE4OiBuZXcgVEhSRUUuRXVsZXIoLTAuMCwgMC42LCAxLjIpLFxyXG4gICAgICAgICAgICAxOTogbmV3IFRIUkVFLkV1bGVyKC0wLjAsIC0wLjUsIC0xLjIpLFxyXG4gICAgICAgICAgICAyMDogbmV3IFRIUkVFLkV1bGVyKC0yLjQsIDIuNywgLTEuMilcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCBkaXN0YW5jZXM6IEFycmF5PHtmYWNlOiBudW1iZXIsIGRpc3RhbmNlOiBudW1iZXJ9PiA9IFtdO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IFtmYWNlTnVtLCB0YXJnZXRSb3RhdGlvbl0gb2YgT2JqZWN0LmVudHJpZXMoZmFjZVJvdGF0aW9ucykpIHtcclxuICAgICAgICAgICAgY29uc3QgZmFjZSA9IHBhcnNlSW50KGZhY2VOdW0pO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZHggPSB0aGlzLm5vcm1hbGl6ZUFuZ2xlKGN1cnJlbnRSb3RhdGlvbi54IC0gdGFyZ2V0Um90YXRpb24ueCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGR5ID0gdGhpcy5ub3JtYWxpemVBbmdsZShjdXJyZW50Um90YXRpb24ueSAtIHRhcmdldFJvdGF0aW9uLnkpO1xyXG4gICAgICAgICAgICBjb25zdCBkeiA9IHRoaXMubm9ybWFsaXplQW5nbGUoY3VycmVudFJvdGF0aW9uLnogLSB0YXJnZXRSb3RhdGlvbi56KTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGRpc3RhbmNlID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeSAqIGR5ICsgZHogKiBkeik7XHJcbiAgICAgICAgICAgIGRpc3RhbmNlcy5wdXNoKHsgZmFjZSwgZGlzdGFuY2UgfSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBTb3J0IGJ5IGRpc3RhbmNlIChjbG9zZXN0IGZpcnN0KVxyXG4gICAgICAgIGRpc3RhbmNlcy5zb3J0KChhLCBiKSA9PiBhLmRpc3RhbmNlIC0gYi5kaXN0YW5jZSk7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKCdDdXJyZW50IHJvdGF0aW9uIHZzIGFsbCBjYWxpYnJhdGVkIGZhY2Ugcm90YXRpb25zOicpO1xyXG4gICAgICAgIGNvbnNvbGUudGFibGUoZGlzdGFuY2VzLm1hcChkID0+ICh7XHJcbiAgICAgICAgICAgIEZhY2U6IGQuZmFjZSxcclxuICAgICAgICAgICAgRGlzdGFuY2U6IHBhcnNlRmxvYXQoZC5kaXN0YW5jZS50b0ZpeGVkKDMpKSxcclxuICAgICAgICAgICAgJ1RhcmdldCBFdWxlciBYJzogZmFjZVJvdGF0aW9uc1tkLmZhY2VdLngudG9GaXhlZCgyKSxcclxuICAgICAgICAgICAgJ1RhcmdldCBFdWxlciBZJzogZmFjZVJvdGF0aW9uc1tkLmZhY2VdLnkudG9GaXhlZCgyKSxcclxuICAgICAgICAgICAgJ1RhcmdldCBFdWxlciBaJzogZmFjZVJvdGF0aW9uc1tkLmZhY2VdLnoudG9GaXhlZCgyKVxyXG4gICAgICAgIH0pKSk7XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKCfwn4+GIFRPUCA1IENMT1NFU1QgTUFUQ0hFUzonKTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IE1hdGgubWluKDUsIGRpc3RhbmNlcy5sZW5ndGgpOyBpKyspIHtcclxuICAgICAgICAgICAgY29uc3QgeyBmYWNlLCBkaXN0YW5jZSB9ID0gZGlzdGFuY2VzW2ldO1xyXG4gICAgICAgICAgICBjb25zdCB0YXJnZXRFdWxlciA9IGZhY2VSb3RhdGlvbnNbZmFjZV07XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGAke2kgPT09IDAgPyAn8J+lhycgOiBpID09PSAxID8gJ/CfpYgnIDogaSA9PT0gMiA/ICfwn6WJJyA6IGkgPT09IDMgPyAnNO+4j+KDoycgOiAnNe+4j+KDoyd9IEZhY2UgJHtmYWNlfTogZGlzdGFuY2UgJHtkaXN0YW5jZS50b0ZpeGVkKDMpfWApO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgICAgVGFyZ2V0OiAoJHt0YXJnZXRFdWxlci54LnRvRml4ZWQoMil9LCAke3RhcmdldEV1bGVyLnkudG9GaXhlZCgyKX0sICR7dGFyZ2V0RXVsZXIuei50b0ZpeGVkKDIpfSlgKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgIEN1cnJlbnQ6ICgke2N1cnJlbnRSb3RhdGlvbi54LnRvRml4ZWQoMil9LCAke2N1cnJlbnRSb3RhdGlvbi55LnRvRml4ZWQoMil9LCAke2N1cnJlbnRSb3RhdGlvbi56LnRvRml4ZWQoMil9KWApO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZHggPSB0aGlzLm5vcm1hbGl6ZUFuZ2xlKGN1cnJlbnRSb3RhdGlvbi54IC0gdGFyZ2V0RXVsZXIueCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGR5ID0gdGhpcy5ub3JtYWxpemVBbmdsZShjdXJyZW50Um90YXRpb24ueSAtIHRhcmdldEV1bGVyLnkpO1xyXG4gICAgICAgICAgICBjb25zdCBkeiA9IHRoaXMubm9ybWFsaXplQW5nbGUoY3VycmVudFJvdGF0aW9uLnogLSB0YXJnZXRFdWxlci56KTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgIERpZmY6ICgke2R4LnRvRml4ZWQoMil9LCAke2R5LnRvRml4ZWQoMil9LCAke2R6LnRvRml4ZWQoMil9KWApO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnJyk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgY2FsY3VsYXRlUm90YXRpb25Ub1Nob3dGYWNlKGZhY2VOb3JtYWw6IFRIUkVFLlZlY3RvcjMpOiBUSFJFRS5FdWxlciB7XHJcbiAgICAgICAgLy8gV2Ugd2FudCB0aGlzIGZhY2Ugbm9ybWFsIHRvIHBvaW50IHVwd2FyZCAocG9zaXRpdmUgWSBkaXJlY3Rpb24pXHJcbiAgICAgICAgY29uc3QgdXBWZWN0b3IgPSBuZXcgVEhSRUUuVmVjdG9yMygwLCAxLCAwKTtcclxuXHJcbiAgICAgICAgLy8gQ3JlYXRlIGEgcm90YXRpb24gdGhhdCBhbGlnbnMgdGhlIGZhY2Ugbm9ybWFsIHdpdGggdXAgdmVjdG9yXHJcbiAgICAgICAgY29uc3QgcXVhdGVybmlvbiA9IG5ldyBUSFJFRS5RdWF0ZXJuaW9uKCk7XHJcbiAgICAgICAgcXVhdGVybmlvbi5zZXRGcm9tVW5pdFZlY3RvcnMoZmFjZU5vcm1hbCwgdXBWZWN0b3IpO1xyXG5cclxuICAgICAgICAvLyBDb252ZXJ0IHRvIEV1bGVyIGFuZ2xlc1xyXG4gICAgICAgIGNvbnN0IGV1bGVyID0gbmV3IFRIUkVFLkV1bGVyKCk7XHJcbiAgICAgICAgZXVsZXIuc2V0RnJvbVF1YXRlcm5pb24ocXVhdGVybmlvbik7XHJcblxyXG4gICAgICAgIHJldHVybiBldWxlcjtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGdldFRvcEZhY2VOdW1iZXIoKTogbnVtYmVyIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBpZiAodGhpcy5mYWNlTm9ybWFscy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignRmFjZSBub3JtYWxzIG5vdCBjYWxjdWxhdGVkLCBmYWxsaW5nIGJhY2sgdG8gcmFuZG9tJyk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBmYWNlQ291bnQgPSB0aGlzLmdldEZhY2VDb3VudCgpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGZhY2VDb3VudCkgKyAxO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBEZWZpbmUgdGhlIGRldGVjdGlvbiB2ZWN0b3IgYmFzZWQgb24gZGljZSB0eXBlXHJcbiAgICAgICAgICAgIC8vIEQ0IHVzZXMgZG93biB2ZWN0b3Igc2luY2UgZmFjZXMgcG9pbnQgZG93bndhcmQgd2hlbiByZXN0aW5nXHJcbiAgICAgICAgICAgIC8vIEFsbCBvdGhlciBkaWNlIHVzZSB1cCB2ZWN0b3Igc2luY2UgZmFjZXMgcG9pbnQgdXB3YXJkIHdoZW4gcmVzdGluZ1xyXG4gICAgICAgICAgICBjb25zdCBkZXRlY3Rpb25WZWN0b3IgPSB0aGlzLnNldHRpbmdzLmRpY2VUeXBlID09PSAnZDQnXHJcbiAgICAgICAgICAgICAgICA/IG5ldyBUSFJFRS5WZWN0b3IzKDAsIC0xLCAwKSAgLy8gRG93biB2ZWN0b3IgZm9yIEQ0XHJcbiAgICAgICAgICAgICAgICA6IG5ldyBUSFJFRS5WZWN0b3IzKDAsIDEsIDApOyAgLy8gVXAgdmVjdG9yIGZvciBvdGhlciBkaWNlXHJcblxyXG4gICAgICAgICAgICAvLyBEZXRlY3Rpb24gdG9sZXJhbmNlIC0gZG90IHByb2R1Y3QgbXVzdCBiZSB3aXRoaW4gdGhpcyByYW5nZSBvZiAxLjAgZm9yIFwidXBcIlxyXG4gICAgICAgICAgICBjb25zdCB0b2xlcmFuY2UgPSB0aGlzLnNldHRpbmdzLmZhY2VEZXRlY3Rpb25Ub2xlcmFuY2U7XHJcbiAgICAgICAgICAgIGNvbnN0IG1pbkRvdFByb2R1Y3QgPSAxLjAgLSB0b2xlcmFuY2U7XHJcblxyXG4gICAgICAgICAgICBsZXQgYmVzdEZhY2UgPSAxO1xyXG4gICAgICAgICAgICBsZXQgYmVzdERvdFByb2R1Y3QgPSAtMTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGRldGVjdGlvblJlc3VsdHM6IEFycmF5PHtmYWNlOiBudW1iZXIsIGRvdFByb2R1Y3Q6IG51bWJlciwgd29ybGROb3JtYWw6IFRIUkVFLlZlY3RvcjN9PiA9IFtdO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2hlY2sgZWFjaCBmYWNlIG5vcm1hbCBhZ2FpbnN0IHRoZSB1cCB2ZWN0b3JcclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmZhY2VOb3JtYWxzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBUcmFuc2Zvcm0gZmFjZSBub3JtYWwgdG8gd29ybGQgc3BhY2UgdXNpbmcgZGljZSByb3RhdGlvblxyXG4gICAgICAgICAgICAgICAgY29uc3Qgd29ybGROb3JtYWwgPSB0aGlzLmZhY2VOb3JtYWxzW2ldLmNsb25lKCk7XHJcbiAgICAgICAgICAgICAgICB3b3JsZE5vcm1hbC5hcHBseVF1YXRlcm5pb24odGhpcy5kaWNlLnF1YXRlcm5pb24pO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIENhbGN1bGF0ZSBkb3QgcHJvZHVjdCB3aXRoIGRldGVjdGlvbiB2ZWN0b3JcclxuICAgICAgICAgICAgICAgIGNvbnN0IGRvdFByb2R1Y3QgPSB3b3JsZE5vcm1hbC5kb3QoZGV0ZWN0aW9uVmVjdG9yKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBHZXQgZmFjZSBudW1iZXIgYmFzZWQgb24gZGljZSB0eXBlXHJcbiAgICAgICAgICAgICAgICBjb25zdCBmYWNlQ291bnQgPSB0aGlzLmdldEZhY2VDb3VudCgpO1xyXG4gICAgICAgICAgICAgICAgbGV0IGZhY2VOdW1iZXIgPSBNYXRoLm1pbihmYWNlQ291bnQsIChpICUgZmFjZUNvdW50KSArIDEpO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIEQxMCBzcGVjaWZpYyBmYWNlIG1hcHBpbmcgY29ycmVjdGlvblxyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZGljZVR5cGUgPT09ICdkMTAnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZDEwTWFwcGluZzogeyBba2V5OiBudW1iZXJdOiBudW1iZXIgfSA9IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgMTogNSwgMjogNCwgMzogMywgNDogMiwgNTogMSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgNjogMTAsIDc6IDksIDg6IDgsIDk6IDcsIDEwOiA2XHJcbiAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgICAgICBmYWNlTnVtYmVyID0gZDEwTWFwcGluZ1tmYWNlTnVtYmVyXSB8fCBmYWNlTnVtYmVyO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgZGV0ZWN0aW9uUmVzdWx0cy5wdXNoKHsgZmFjZTogZmFjZU51bWJlciwgZG90UHJvZHVjdCwgd29ybGROb3JtYWwgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgdGhpcyBmYWNlIGlzIHBvaW50aW5nIFwidXBcIiAod2l0aGluIHRvbGVyYW5jZSlcclxuICAgICAgICAgICAgICAgIGlmIChkb3RQcm9kdWN0ID4gYmVzdERvdFByb2R1Y3QpIHtcclxuICAgICAgICAgICAgICAgICAgICBiZXN0RG90UHJvZHVjdCA9IGRvdFByb2R1Y3Q7XHJcbiAgICAgICAgICAgICAgICAgICAgYmVzdEZhY2UgPSBmYWNlTnVtYmVyO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBTb3J0IGJ5IGRvdCBwcm9kdWN0IChiZXN0IG1hdGNoIGZpcnN0KVxyXG4gICAgICAgICAgICBkZXRlY3Rpb25SZXN1bHRzLnNvcnQoKGEsIGIpID0+IGIuZG90UHJvZHVjdCAtIGEuZG90UHJvZHVjdCk7XHJcblxyXG4gICAgICAgICAgICAvLyBEZWJ1ZyBsb2dnaW5nXHJcbiAgICAgICAgICAgIGNvbnN0IGRpcmVjdGlvbk5hbWUgPSB0aGlzLnNldHRpbmdzLmRpY2VUeXBlID09PSAnZDQnID8gJ0RPV04nIDogJ1VQJztcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ/Cfjq8gRmFjZSBOb3JtYWwgRGV0ZWN0aW9uIFJlc3VsdHM6Jyk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBEZXRlY3Rpb24gdmVjdG9yICgke2RpcmVjdGlvbk5hbWV9KTogKCR7ZGV0ZWN0aW9uVmVjdG9yLnh9LCAke2RldGVjdGlvblZlY3Rvci55fSwgJHtkZXRlY3Rpb25WZWN0b3Iuen0pYCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBUb2xlcmFuY2U6ICR7dG9sZXJhbmNlfSAobWluIGRvdCBwcm9kdWN0OiAke21pbkRvdFByb2R1Y3QudG9GaXhlZCgzKX0pYCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGBCZXN0IGZhY2U6ICR7YmVzdEZhY2V9IChkb3QgcHJvZHVjdDogJHtiZXN0RG90UHJvZHVjdC50b0ZpeGVkKDMpfSlgKTtcclxuXHJcbiAgICAgICAgICAgIC8vIExvZyB0b3AgNSBjYW5kaWRhdGVzXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCfwn4+GIFRPUCA1IEZBQ0UgQ0FORElEQVRFUzonKTtcclxuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBNYXRoLm1pbig1LCBkZXRlY3Rpb25SZXN1bHRzLmxlbmd0aCk7IGkrKykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gZGV0ZWN0aW9uUmVzdWx0c1tpXTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGVtb2ppID0gaSA9PT0gMCA/ICfwn6WHJyA6IGkgPT09IDEgPyAn8J+liCcgOiBpID09PSAyID8gJ/CfpYknIDogaSA9PT0gMyA/ICc077iP4oOjJyA6ICc177iP4oOjJztcclxuICAgICAgICAgICAgICAgIGNvbnN0IGlzRGV0ZWN0ZWQgPSByZXN1bHQuZG90UHJvZHVjdCA+PSBtaW5Eb3RQcm9kdWN0ID8gYOKchSAke2RpcmVjdGlvbk5hbWV9YCA6ICfinYwnO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYCR7ZW1vaml9IEZhY2UgJHtyZXN1bHQuZmFjZX06IGRvdD0ke3Jlc3VsdC5kb3RQcm9kdWN0LnRvRml4ZWQoMyl9ICR7aXNEZXRlY3RlZH1gKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGAgICBXb3JsZCBub3JtYWw6ICgke3Jlc3VsdC53b3JsZE5vcm1hbC54LnRvRml4ZWQoMyl9LCAke3Jlc3VsdC53b3JsZE5vcm1hbC55LnRvRml4ZWQoMyl9LCAke3Jlc3VsdC53b3JsZE5vcm1hbC56LnRvRml4ZWQoMyl9KWApO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBXYXJuIGlmIG5vIGZhY2UgaXMgY2xlYXJseSBkZXRlY3RlZFxyXG4gICAgICAgICAgICBjb25zdCBkZXRlY3Rpb25UeXBlID0gdGhpcy5zZXR0aW5ncy5kaWNlVHlwZSA9PT0gJ2Q0JyA/ICdkb3duJyA6ICd1cCc7XHJcbiAgICAgICAgICAgIGlmIChiZXN0RG90UHJvZHVjdCA8IG1pbkRvdFByb2R1Y3QpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2Fybihg4pqg77iPIE5vIGZhY2UgaXMgY2xlYXJseSBwb2ludGluZyAke2RldGVjdGlvblR5cGV9ISBCZXN0IGRvdCBwcm9kdWN0OiAke2Jlc3REb3RQcm9kdWN0LnRvRml4ZWQoMyl9ICh0aHJlc2hvbGQ6ICR7bWluRG90UHJvZHVjdC50b0ZpeGVkKDMpfSlgKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybignRGljZSBtYXkgc3RpbGwgYmUgbW92aW5nIG9yIGluIGFuIGVkZ2UgY2FzZSBvcmllbnRhdGlvbicpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICByZXR1cm4gYmVzdEZhY2U7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgaW4gZmFjZSBub3JtYWwgZGV0ZWN0aW9uOicsIGVycm9yKTtcclxuICAgICAgICAgICAgY29uc3QgZmFjZUNvdW50ID0gdGhpcy5nZXRGYWNlQ291bnQoKTtcclxuICAgICAgICAgICAgcmV0dXJuIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGZhY2VDb3VudCkgKyAxO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHNuYXBEaWNlVG9GYWNlKGZhY2VOdW1iZXI6IG51bWJlciwgdGFyZ2V0UG9zaXRpb24/OiBUSFJFRS5WZWN0b3IzKTogdm9pZCB7XHJcbiAgICAgICAgaWYgKCF0aGlzLmRpY2VHZW9tZXRyeSB8fCB0aGlzLmZhY2VOb3JtYWxzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBmYWNlSW5kZXggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihmYWNlTnVtYmVyIC0gMSwgdGhpcy5mYWNlTm9ybWFscy5sZW5ndGggLSAxKSk7XHJcbiAgICAgICAgY29uc3QgZmFjZU5vcm1hbCA9IHRoaXMuZmFjZU5vcm1hbHNbZmFjZUluZGV4XTtcclxuICAgICAgICBpZiAoIWZhY2VOb3JtYWwpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgdGFyZ2V0Um90YXRpb24gPSB0aGlzLmNhbGN1bGF0ZVJvdGF0aW9uVG9TaG93RmFjZShmYWNlTm9ybWFsLmNsb25lKCkpO1xyXG4gICAgICAgIGNvbnN0IHRhcmdldFF1YXRlcm5pb24gPSBuZXcgVEhSRUUuUXVhdGVybmlvbigpLnNldEZyb21FdWxlcih0YXJnZXRSb3RhdGlvbik7XHJcbiAgICAgICAgY29uc3QgbG93ZXN0VmVydGV4WSA9IHRoaXMuZ2V0TG93ZXN0VmVydGV4WUZvclF1YXRlcm5pb24odGFyZ2V0UXVhdGVybmlvbik7XHJcbiAgICAgICAgY29uc3QgZGVzaXJlZFkgPSB0aGlzLmZsb29ySGVpZ2h0IC0gbG93ZXN0VmVydGV4WSArIDAuMDAyO1xyXG4gICAgICAgIGNvbnN0IG5leHRQb3NpdGlvbiA9IHRhcmdldFBvc2l0aW9uID8gdGFyZ2V0UG9zaXRpb24uY2xvbmUoKSA6IHRoaXMuZGljZS5wb3NpdGlvbi5jbG9uZSgpO1xyXG4gICAgICAgIG5leHRQb3NpdGlvbi55ID0gZGVzaXJlZFk7XHJcblxyXG4gICAgICAgIHRoaXMuZGljZS5xdWF0ZXJuaW9uLmNvcHkodGFyZ2V0UXVhdGVybmlvbik7XHJcbiAgICAgICAgdGhpcy5kaWNlLnBvc2l0aW9uLmNvcHkobmV4dFBvc2l0aW9uKTtcclxuXHJcbiAgICAgICAgdGhpcy5kaWNlQm9keS5xdWF0ZXJuaW9uLnNldCh0YXJnZXRRdWF0ZXJuaW9uLngsIHRhcmdldFF1YXRlcm5pb24ueSwgdGFyZ2V0UXVhdGVybmlvbi56LCB0YXJnZXRRdWF0ZXJuaW9uLncpO1xyXG4gICAgICAgIHRoaXMuZGljZUJvZHkucG9zaXRpb24uc2V0KG5leHRQb3NpdGlvbi54LCBuZXh0UG9zaXRpb24ueSwgbmV4dFBvc2l0aW9uLnopO1xyXG4gICAgICAgIHRoaXMuZGljZUJvZHkudmVsb2NpdHkuc2V0KDAsIDAsIDApO1xyXG4gICAgICAgIHRoaXMuZGljZUJvZHkuYW5ndWxhclZlbG9jaXR5LnNldCgwLCAwLCAwKTtcclxuICAgICAgICB0aGlzLmRpY2VCb2R5LmZvcmNlLnNldCgwLCAwLCAwKTtcclxuICAgICAgICB0aGlzLmRpY2VCb2R5LnRvcnF1ZS5zZXQoMCwgMCwgMCk7XHJcbiAgICAgICAgdGhpcy5kaWNlQm9keS5hbGxvd1NsZWVwID0gdHJ1ZTtcclxuICAgICAgICB0aGlzLmRpY2VCb2R5LnNsZWVwU3BlZWRMaW1pdCA9IDAuMDI7XHJcbiAgICAgICAgdGhpcy5kaWNlQm9keS5zbGVlcFRpbWVMaW1pdCA9IDAuMjtcclxuICAgICAgICB0aGlzLmRpY2VCb2R5LnNsZWVwKCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBnZXRMb3dlc3RWZXJ0ZXhZRm9yUXVhdGVybmlvbihxdWF0ZXJuaW9uOiBUSFJFRS5RdWF0ZXJuaW9uKTogbnVtYmVyIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGljZUdlb21ldHJ5KSB7XHJcbiAgICAgICAgICAgIHJldHVybiAwO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgcG9zaXRpb25BdHRyaWJ1dGUgPSB0aGlzLmRpY2VHZW9tZXRyeS5hdHRyaWJ1dGVzLnBvc2l0aW9uO1xyXG4gICAgICAgIGlmICghcG9zaXRpb25BdHRyaWJ1dGUpIHtcclxuICAgICAgICAgICAgcmV0dXJuIDA7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCB2ZXJ0ZXggPSBuZXcgVEhSRUUuVmVjdG9yMygpO1xyXG4gICAgICAgIGxldCBtaW5ZID0gSW5maW5pdHk7XHJcblxyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcG9zaXRpb25BdHRyaWJ1dGUuY291bnQ7IGkrKykge1xyXG4gICAgICAgICAgICB2ZXJ0ZXguZnJvbUJ1ZmZlckF0dHJpYnV0ZShwb3NpdGlvbkF0dHJpYnV0ZSwgaSk7XHJcbiAgICAgICAgICAgIHZlcnRleC5hcHBseVF1YXRlcm5pb24ocXVhdGVybmlvbik7XHJcbiAgICAgICAgICAgIGlmICh2ZXJ0ZXgueSA8IG1pblkpIHtcclxuICAgICAgICAgICAgICAgIG1pblkgPSB2ZXJ0ZXgueTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIG1pblkgPT09IEluZmluaXR5ID8gMCA6IG1pblk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBzbmFwVG9OZWFyZXN0RmFjZSgpOiB2b2lkIHtcclxuICAgICAgICBjb25zdCBuZWFyZXN0RmFjZSA9IHRoaXMuZ2V0VG9wRmFjZU51bWJlcigpO1xyXG5cclxuICAgICAgICAvLyBBbGwgc25hcCBiZWhhdmlvciByZW1vdmVkIC0gZGljZSBzZXR0bGUgbmF0dXJhbGx5XHJcblxyXG4gICAgICAgIGNvbnN0IGZhY2VSb3RhdGlvbnM6IHsgW2tleTogbnVtYmVyXTogVEhSRUUuRXVsZXIgfSA9IHtcclxuICAgICAgICAgICAgMTogbmV3IFRIUkVFLkV1bGVyKC0xLjcsIC0wLjksIC0yLjUpLFxyXG4gICAgICAgICAgICAyOiBuZXcgVEhSRUUuRXVsZXIoLTAuMCwgLTAuNSwgMi4wKSxcclxuICAgICAgICAgICAgMzogbmV3IFRIUkVFLkV1bGVyKC0wLjAsIDAuNiwgLTEuOSksXHJcbiAgICAgICAgICAgIDQ6IG5ldyBUSFJFRS5FdWxlcigtMC41LCAtMi44LCAwLjYpLFxyXG4gICAgICAgICAgICA1OiBuZXcgVEhSRUUuRXVsZXIoLTIuNCwgLTAuNCwgLTEuOSksXHJcbiAgICAgICAgICAgIDY6IG5ldyBUSFJFRS5FdWxlcigtMS43LCAyLjksIDAuNiksXHJcbiAgICAgICAgICAgIDc6IG5ldyBUSFJFRS5FdWxlcigtMS4yLCAwLjEsIC0xLjUpLFxyXG4gICAgICAgICAgICA4OiBuZXcgVEhSRUUuRXVsZXIoLTAuNywgMi4yLCAtMi41KSxcclxuICAgICAgICAgICAgOTogbmV3IFRIUkVFLkV1bGVyKDAuNywgMC42LCAtMS4yKSxcclxuICAgICAgICAgICAgMTA6IG5ldyBUSFJFRS5FdWxlcigtMi44LCAwLjEsIDAuMSksXHJcbiAgICAgICAgICAgIDExOiBuZXcgVEhSRUUuRXVsZXIoMi41LCAxLjAsIC0yLjUpLFxyXG4gICAgICAgICAgICAxMjogbmV3IFRIUkVFLkV1bGVyKC0xLjcsIC0wLjksIDAuNiksXHJcbiAgICAgICAgICAgIDEzOiBuZXcgVEhSRUUuRXVsZXIoLTIuNiwgLTAuMCwgLTMuMSksXHJcbiAgICAgICAgICAgIDE0OiBuZXcgVEhSRUUuRXVsZXIoLTIuOCwgLTIuNywgMC4wKSxcclxuICAgICAgICAgICAgMTU6IG5ldyBUSFJFRS5FdWxlcigtMS4yLCAtMC4wLCAxLjYpLFxyXG4gICAgICAgICAgICAxNjogbmV3IFRIUkVFLkV1bGVyKC0wLjYsIC0yLjgsIC0yLjUpLFxyXG4gICAgICAgICAgICAxNzogbmV3IFRIUkVFLkV1bGVyKC0yLjMsIC0wLjUsIDEuMyksXHJcbiAgICAgICAgICAgIDE4OiBuZXcgVEhSRUUuRXVsZXIoLTAuMCwgMC42LCAxLjIpLFxyXG4gICAgICAgICAgICAxOTogbmV3IFRIUkVFLkV1bGVyKC0wLjAsIC0wLjUsIC0xLjIpLFxyXG4gICAgICAgICAgICAyMDogbmV3IFRIUkVFLkV1bGVyKC0yLjQsIDIuNywgLTEuMilcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCB0YXJnZXRSb3RhdGlvbiA9IGZhY2VSb3RhdGlvbnNbbmVhcmVzdEZhY2VdO1xyXG4gICAgICAgIGlmICh0YXJnZXRSb3RhdGlvbikge1xyXG4gICAgICAgICAgICBjb25zdCBjdXJyZW50Um90YXRpb24gPSB0aGlzLmRpY2Uucm90YXRpb247XHJcbiAgICAgICAgICAgIGNvbnN0IHNuYXBTdHJlbmd0aCA9IDAuNTtcclxuXHJcbiAgICAgICAgICAgIHRoaXMuZGljZS5yb3RhdGlvbi54ID0gY3VycmVudFJvdGF0aW9uLnggKyAodGFyZ2V0Um90YXRpb24ueCAtIGN1cnJlbnRSb3RhdGlvbi54KSAqIHNuYXBTdHJlbmd0aDtcclxuICAgICAgICAgICAgdGhpcy5kaWNlLnJvdGF0aW9uLnkgPSBjdXJyZW50Um90YXRpb24ueSArICh0YXJnZXRSb3RhdGlvbi55IC0gY3VycmVudFJvdGF0aW9uLnkpICogc25hcFN0cmVuZ3RoO1xyXG4gICAgICAgICAgICB0aGlzLmRpY2Uucm90YXRpb24ueiA9IGN1cnJlbnRSb3RhdGlvbi56ICsgKHRhcmdldFJvdGF0aW9uLnogLSBjdXJyZW50Um90YXRpb24ueikgKiBzbmFwU3RyZW5ndGg7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBxdWF0ZXJuaW9uID0gbmV3IFRIUkVFLlF1YXRlcm5pb24oKTtcclxuICAgICAgICAgICAgcXVhdGVybmlvbi5zZXRGcm9tRXVsZXIodGhpcy5kaWNlLnJvdGF0aW9uKTtcclxuICAgICAgICAgICAgdGhpcy5kaWNlQm9keS5xdWF0ZXJuaW9uLnNldChxdWF0ZXJuaW9uLngsIHF1YXRlcm5pb24ueSwgcXVhdGVybmlvbi56LCBxdWF0ZXJuaW9uLncpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIG5vcm1hbGl6ZUFuZ2xlKGFuZ2xlOiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgICAgIC8vIE5vcm1hbGl6ZSBhbmdsZSB0byBbLc+ALCDPgF1cclxuICAgICAgICB3aGlsZSAoYW5nbGUgPiBNYXRoLlBJKSBhbmdsZSAtPSAyICogTWF0aC5QSTtcclxuICAgICAgICB3aGlsZSAoYW5nbGUgPCAtTWF0aC5QSSkgYW5nbGUgKz0gMiAqIE1hdGguUEk7XHJcbiAgICAgICAgcmV0dXJuIGFuZ2xlO1xyXG4gICAgfVxyXG5cclxuXHJcbiAgICBwcml2YXRlIHNldEluaXRpYWxTaXplKCkge1xyXG4gICAgICAgIC8vIEdldCB0aGUgZnVsbCB3aW5kb3cgc2l6ZSBtaW51cyByaWJib25cclxuICAgICAgICBjb25zdCBjb250YWluZXJXaWR0aCA9IHdpbmRvdy5pbm5lcldpZHRoO1xyXG4gICAgICAgIGNvbnN0IGNvbnRhaW5lckhlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodCAtIDQ0OyAvLyA0NHB4IGZvciByaWJib25cclxuICAgICAgICB0aGlzLnVwZGF0ZVNpemUoY29udGFpbmVyV2lkdGgsIGNvbnRhaW5lckhlaWdodCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHVibGljIHVwZGF0ZVNpemUod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpIHtcclxuICAgICAgICAvLyBGb3JjZSByZW5kZXJlciB0byBleGFjdGx5IG1hdGNoIHRoZSBwcm92aWRlZCBkaW1lbnNpb25zXHJcbiAgICAgICAgdGhpcy5yZW5kZXJlci5zZXRTaXplKHdpZHRoLCBoZWlnaHQsIHRydWUpO1xyXG5cclxuICAgICAgICAvLyBVcGRhdGUgcGl4ZWwgcmF0aW8gZm9yIGNyaXNwIHJlbmRlcmluZ1xyXG4gICAgICAgIHRoaXMucmVuZGVyZXIuc2V0UGl4ZWxSYXRpbyh3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyk7XHJcblxyXG4gICAgICAgIC8vIFNldCBjYW52YXMgdG8gZmlsbCBjb250YWluZXIgY29tcGxldGVseSB3aXRob3V0IGFueSBjb25zdHJhaW50c1xyXG4gICAgICAgIGNvbnN0IGNhbnZhcyA9IHRoaXMucmVuZGVyZXIuZG9tRWxlbWVudDtcclxuICAgICAgICBjYW52YXMuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XHJcbiAgICAgICAgY2FudmFzLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XHJcbiAgICAgICAgY2FudmFzLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xyXG4gICAgICAgIGNhbnZhcy5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcbiAgICAgICAgY2FudmFzLnN0eWxlLnRvcCA9ICcwJztcclxuICAgICAgICBjYW52YXMuc3R5bGUubGVmdCA9ICcwJztcclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIG9ydGhvZ3JhcGhpYyBjYW1lcmEgZnJ1c3R1bSB0byBtYXRjaCB0aGUgZXhhY3Qgd2luZG93IGRpbWVuc2lvbnNcclxuICAgICAgICBjb25zdCBhc3BlY3QgPSB3aWR0aCAvIGhlaWdodDtcclxuICAgICAgICBjb25zdCBmcnVzdHVtU2l6ZSA9IDIwO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLmxlZnQgPSAtZnJ1c3R1bVNpemUgKiBhc3BlY3QgLyAyO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLnJpZ2h0ID0gZnJ1c3R1bVNpemUgKiBhc3BlY3QgLyAyO1xyXG4gICAgICAgIHRoaXMuY2FtZXJhLnRvcCA9IGZydXN0dW1TaXplIC8gMjtcclxuICAgICAgICB0aGlzLmNhbWVyYS5ib3R0b20gPSAtZnJ1c3R1bVNpemUgLyAyO1xyXG5cclxuICAgICAgICAvLyBVcGRhdGUgdGhlIGNhbWVyYSBwcm9qZWN0aW9uIG1hdHJpeCBmb3Igb3J0aG9ncmFwaGljIGNhbWVyYVxyXG4gICAgICAgIHRoaXMuY2FtZXJhLnVwZGF0ZVByb2plY3Rpb25NYXRyaXgoKTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIHJlaW5pdGlhbGl6ZUFmdGVyQ29udGV4dExvc3MoKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgLy8gUmVjcmVhdGUgdGhlIHNjZW5lIGVsZW1lbnRzXHJcbiAgICAgICAgICAgIHRoaXMuY3JlYXRlRGljZVRyYXkoKTtcclxuICAgICAgICAgICAgdGhpcy5zZXR1cExpZ2h0aW5nKCk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdTY2VuZSByZWluaXRpYWxpemVkIGFmdGVyIFdlYkdMIGNvbnRleHQgcmVzdG9yZScpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byByZWluaXRpYWxpemUgc2NlbmUgYWZ0ZXIgY29udGV4dCBsb3NzOicsIGVycm9yKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBjcmVhdGVXaW5kb3dCb3JkZXIoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3Muc2hvd1dpbmRvd0JvcmRlcikge1xyXG4gICAgICAgICAgICB0aGlzLndpbmRvd0JvcmRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xyXG4gICAgICAgICAgICB0aGlzLndpbmRvd0JvcmRlci5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XHJcbiAgICAgICAgICAgIHRoaXMud2luZG93Qm9yZGVyLnN0eWxlLnRvcCA9ICcwJztcclxuICAgICAgICAgICAgdGhpcy53aW5kb3dCb3JkZXIuc3R5bGUubGVmdCA9ICcwJztcclxuICAgICAgICAgICAgdGhpcy53aW5kb3dCb3JkZXIuc3R5bGUud2lkdGggPSAnMTAwJSc7XHJcbiAgICAgICAgICAgIHRoaXMud2luZG93Qm9yZGVyLnN0eWxlLmhlaWdodCA9ICcxMDAlJztcclxuICAgICAgICAgICAgdGhpcy53aW5kb3dCb3JkZXIuc3R5bGUuYm9yZGVyID0gYCR7dGhpcy5zZXR0aW5ncy53aW5kb3dCb3JkZXJXaWR0aH1weCBzb2xpZCAke3RoaXMuc2V0dGluZ3Mud2luZG93Qm9yZGVyQ29sb3J9YDtcclxuICAgICAgICAgICAgdGhpcy53aW5kb3dCb3JkZXIuc3R5bGUub3BhY2l0eSA9IHRoaXMuc2V0dGluZ3Mud2luZG93Qm9yZGVyT3BhY2l0eS50b1N0cmluZygpO1xyXG4gICAgICAgICAgICB0aGlzLndpbmRvd0JvcmRlci5zdHlsZS5wb2ludGVyRXZlbnRzID0gJ25vbmUnO1xyXG4gICAgICAgICAgICB0aGlzLndpbmRvd0JvcmRlci5zdHlsZS5ib3hTaXppbmcgPSAnYm9yZGVyLWJveCc7XHJcbiAgICAgICAgICAgIHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMud2luZG93Qm9yZGVyKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSByZW1vdmVXaW5kb3dCb3JkZXIoKSB7XHJcbiAgICAgICAgaWYgKHRoaXMud2luZG93Qm9yZGVyKSB7XHJcbiAgICAgICAgICAgIHRoaXMuY29udGFpbmVyLnJlbW92ZUNoaWxkKHRoaXMud2luZG93Qm9yZGVyKTtcclxuICAgICAgICAgICAgdGhpcy53aW5kb3dCb3JkZXIgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgdXBkYXRlU2V0dGluZ3MobmV3U2V0dGluZ3M6IERpY2VTZXR0aW5ncykge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5SnIEQyMERpY2Ugc2V0dGluZ3MgdXBkYXRlZDonLCB7XHJcbiAgICAgICAgICAgIG9sZE1vdGlvblRocmVzaG9sZDogdGhpcy5zZXR0aW5ncy5tb3Rpb25UaHJlc2hvbGQsXHJcbiAgICAgICAgICAgIG5ld01vdGlvblRocmVzaG9sZDogbmV3U2V0dGluZ3MubW90aW9uVGhyZXNob2xkLFxyXG4gICAgICAgICAgICBvbGRSZXN1bHRBbmltYXRpb246IHRoaXMuc2V0dGluZ3MuZW5hYmxlUmVzdWx0QW5pbWF0aW9uLFxyXG4gICAgICAgICAgICBuZXdSZXN1bHRBbmltYXRpb246IG5ld1NldHRpbmdzLmVuYWJsZVJlc3VsdEFuaW1hdGlvblxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MgPSBuZXdTZXR0aW5ncztcclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIHdpbmRvdyBib3JkZXJcclxuICAgICAgICB0aGlzLnJlbW92ZVdpbmRvd0JvcmRlcigpO1xyXG4gICAgICAgIHRoaXMuY3JlYXRlV2luZG93Qm9yZGVyKCk7XHJcblxyXG5cclxuICAgICAgICAvLyBVcGRhdGUgZGljZSBtYXRlcmlhbCBwcm9wZXJ0aWVzXHJcbiAgICAgICAgaWYgKHRoaXMuZGljZSAmJiB0aGlzLmRpY2UubWF0ZXJpYWwpIHtcclxuICAgICAgICAgICAgY29uc3QgbWF0ZXJpYWwgPSB0aGlzLmRpY2UubWF0ZXJpYWwgYXMgVEhSRUUuTWVzaFBob25nTWF0ZXJpYWw7XHJcbiAgICAgICAgICAgIG1hdGVyaWFsLmNvbG9yLnNldFN0eWxlKHRoaXMuc2V0dGluZ3MuZGljZUNvbG9yKTtcclxuICAgICAgICAgICAgbWF0ZXJpYWwuc2hpbmluZXNzID0gdGhpcy5zZXR0aW5ncy5kaWNlU2hpbmluZXNzO1xyXG4gICAgICAgICAgICBtYXRlcmlhbC5zcGVjdWxhciA9IG5ldyBUSFJFRS5Db2xvcih0aGlzLnNldHRpbmdzLmRpY2VTcGVjdWxhcik7XHJcbiAgICAgICAgICAgIG1hdGVyaWFsLnRyYW5zcGFyZW50ID0gdGhpcy5zZXR0aW5ncy5kaWNlVHJhbnNwYXJlbnQ7XHJcbiAgICAgICAgICAgIG1hdGVyaWFsLm9wYWNpdHkgPSB0aGlzLnNldHRpbmdzLmRpY2VPcGFjaXR5O1xyXG4gICAgICAgICAgICBtYXRlcmlhbC5uZWVkc1VwZGF0ZSA9IHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBOb3RlOiBJbiBtdWx0aS1kaWNlIHN5c3RlbSwgaW5kaXZpZHVhbCBkaWNlIHNldHRpbmdzIGFyZSBoYW5kbGVkIHdoZW4gY3JlYXRlZFxyXG4gICAgICAgIC8vIE5vIG5lZWQgdG8gcmVjcmVhdGUgYWxsIGRpY2Ugb24gc2V0dGluZ3MgY2hhbmdlXHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSB0cmF5XHJcbiAgICAgICAgaWYgKHRoaXMudHJheU1lc2gpIHtcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5yZW1vdmUodGhpcy50cmF5TWVzaCk7XHJcbiAgICAgICAgICAgIHRoaXMudHJheU1lc2ggPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmNyZWF0ZURpY2VUcmF5KCk7XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSByZW5kZXJlciBzaGFkb3cgc2V0dGluZ3NcclxuICAgICAgICB0aGlzLnJlbmRlcmVyLnNoYWRvd01hcC5lbmFibGVkID0gdGhpcy5zZXR0aW5ncy5lbmFibGVTaGFkb3dzO1xyXG5cclxuICAgICAgICAvLyBVcGRhdGUgbGlnaHRpbmdcclxuICAgICAgICB0aGlzLnNldHVwTGlnaHRpbmcoKTtcclxuICAgIH1cclxuXHJcbiAgICBwdWJsaWMgZGVzdHJveSgpIHtcclxuICAgICAgICBpZiAodGhpcy5hbmltYXRpb25JZCkge1xyXG4gICAgICAgICAgICBjYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLmFuaW1hdGlvbklkKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICh0aGlzLnJvbGxUaW1lb3V0KSB7XHJcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnJvbGxUaW1lb3V0KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENsZWFuIHVwIGhvdmVyIGNpcmNsZVxyXG4gICAgICAgIGlmICh0aGlzLmhvdmVyQ2lyY2xlKSB7XHJcbiAgICAgICAgICAgIHRoaXMuc2NlbmUucmVtb3ZlKHRoaXMuaG92ZXJDaXJjbGUpO1xyXG4gICAgICAgICAgICB0aGlzLmhvdmVyQ2lyY2xlID0gbnVsbDtcclxuICAgICAgICAgICAgdGhpcy5ob3ZlckNpcmNsZU1hdGVyaWFsID0gbnVsbDtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENsZWFuIHVwIHdpbmRvdyBib3JkZXJcclxuICAgICAgICB0aGlzLnJlbW92ZVdpbmRvd0JvcmRlcigpO1xyXG5cclxuICAgICAgICAvLyBSZW1vdmUgZXZlbnQgbGlzdGVuZXJzXHJcbiAgICAgICAgaWYgKHRoaXMucmVuZGVyZXIpIHtcclxuICAgICAgICAgICAgY29uc3QgY2FudmFzID0gdGhpcy5yZW5kZXJlci5kb21FbGVtZW50O1xyXG5cclxuICAgICAgICAgICAgdGhpcy5jb250YWluZXIucmVtb3ZlQ2hpbGQodGhpcy5yZW5kZXJlci5kb21FbGVtZW50KTtcclxuICAgICAgICAgICAgdGhpcy5yZW5kZXJlci5kaXNwb3NlKCk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBnbCA9IHRoaXMucmVuZGVyZXIuZ2V0Q29udGV4dCgpO1xyXG4gICAgICAgICAgICBpZiAoZ2wgJiYgZ2wuZ2V0RXh0ZW5zaW9uKCdXRUJHTF9sb3NlX2NvbnRleHQnKSkge1xyXG4gICAgICAgICAgICAgICAgZ2wuZ2V0RXh0ZW5zaW9uKCdXRUJHTF9sb3NlX2NvbnRleHQnKSEubG9zZUNvbnRleHQoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHRoaXMuc2NlbmUpIHtcclxuICAgICAgICAgICAgdGhpcy5zY2VuZS5jbGVhcigpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHRoaXMud29ybGQpIHtcclxuICAgICAgICAgICAgdGhpcy53b3JsZC5ib2RpZXMuZm9yRWFjaChib2R5ID0+IHtcclxuICAgICAgICAgICAgICAgIHRoaXMud29ybGQucmVtb3ZlQm9keShib2R5KTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHB1YmxpYyBhdXRvQ2FsaWJyYXRlRmFjZShmYWNlTnVtYmVyOiBudW1iZXIpOiBib29sZWFuIHtcclxuICAgICAgICBpZiAoIXRoaXMuZGljZSB8fCAhdGhpcy5kaWNlQm9keSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdDYW5ub3QgY2FsaWJyYXRlOiBkaWNlIG5vdCBpbml0aWFsaXplZCcpO1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBmYWNlQ291bnQgPSB0aGlzLmdldEZhY2VDb3VudCgpO1xyXG4gICAgICAgIGlmIChmYWNlTnVtYmVyIDwgMSB8fCBmYWNlTnVtYmVyID4gZmFjZUNvdW50KSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhY2UgbnVtYmVyIG11c3QgYmUgYmV0d2VlbiAxIGFuZCAke2ZhY2VDb3VudH0gZm9yICR7dGhpcy5zZXR0aW5ncy5kaWNlVHlwZX1gKTtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coYPCfjq8gQVVUTy1DQUxJQlJBVElORyBGYWNlICR7ZmFjZU51bWJlcn1gKTtcclxuXHJcbiAgICAgICAgLy8gRmluZCB3aGljaCBmYWNlIGlzIGN1cnJlbnRseSBwb2ludGluZyBtb3N0IHVwd2FyZFxyXG4gICAgICAgIGNvbnN0IHVwVmVjdG9yID0gbmV3IFRIUkVFLlZlY3RvcjMoMCwgMSwgMCk7XHJcbiAgICAgICAgbGV0IGJlc3RGYWNlSW5kZXggPSAwO1xyXG4gICAgICAgIGxldCBiZXN0RG90UHJvZHVjdCA9IC0xO1xyXG5cclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuZmFjZU5vcm1hbHMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgLy8gVHJhbnNmb3JtIGZhY2Ugbm9ybWFsIHRvIHdvcmxkIHNwYWNlXHJcbiAgICAgICAgICAgIGNvbnN0IHdvcmxkTm9ybWFsID0gdGhpcy5mYWNlTm9ybWFsc1tpXS5jbG9uZSgpO1xyXG4gICAgICAgICAgICB3b3JsZE5vcm1hbC5hcHBseVF1YXRlcm5pb24odGhpcy5kaWNlLnF1YXRlcm5pb24pO1xyXG5cclxuICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIGRvdCBwcm9kdWN0IHdpdGggdXAgdmVjdG9yXHJcbiAgICAgICAgICAgIGNvbnN0IGRvdFByb2R1Y3QgPSB3b3JsZE5vcm1hbC5kb3QodXBWZWN0b3IpO1xyXG5cclxuICAgICAgICAgICAgaWYgKGRvdFByb2R1Y3QgPiBiZXN0RG90UHJvZHVjdCkge1xyXG4gICAgICAgICAgICAgICAgYmVzdERvdFByb2R1Y3QgPSBkb3RQcm9kdWN0O1xyXG4gICAgICAgICAgICAgICAgYmVzdEZhY2VJbmRleCA9IGk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnNvbGUubG9nKGBDdXJyZW50IHVwd2FyZC1mYWNpbmcgZ2VvbWV0cnkgZmFjZSBpbmRleDogJHtiZXN0RmFjZUluZGV4fWApO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBEb3QgcHJvZHVjdCB3aXRoIHVwIHZlY3RvcjogJHtiZXN0RG90UHJvZHVjdC50b0ZpeGVkKDMpfWApO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKGBNYXBwaW5nIGZhY2UgaW5kZXggJHtiZXN0RmFjZUluZGV4fSB0byBudW1iZXIgJHtmYWNlTnVtYmVyfWApO1xyXG5cclxuICAgICAgICAvLyBVcGRhdGUgdGhlIGZhY2UgbWFwcGluZyBpbW1lZGlhdGVseVxyXG4gICAgICAgIHRoaXMuc2V0dGluZ3MuZmFjZU1hcHBpbmdbYmVzdEZhY2VJbmRleF0gPSBmYWNlTnVtYmVyO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZyhg4pyFIEZhY2UgJHtmYWNlTnVtYmVyfSBjYWxpYnJhdGVkISBHZW9tZXRyeSBmYWNlICR7YmVzdEZhY2VJbmRleH0gbm93IG1hcHMgdG8gJHtmYWNlTnVtYmVyfWApO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCdVcGRhdGVkIGZhY2UgbWFwcGluZzonLCB0aGlzLnNldHRpbmdzLmZhY2VNYXBwaW5nKTtcclxuXHJcbiAgICAgICAgLy8gVHJpZ2dlciBhIHNldHRpbmdzIHNhdmUgdGhyb3VnaCB0aGUgcGx1Z2luXHJcbiAgICAgICAgaWYgKHRoaXMub25DYWxpYnJhdGlvbkNoYW5nZWQpIHtcclxuICAgICAgICAgICAgdGhpcy5vbkNhbGlicmF0aW9uQ2hhbmdlZCgpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2FsbGJhY2sgZm9yIHdoZW4gY2FsaWJyYXRpb24gY2hhbmdlc1xyXG4gICAgcHVibGljIG9uQ2FsaWJyYXRpb25DaGFuZ2VkOiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICBwdWJsaWMgc2V0Q2xpY2t0aHJvdWdoTW9kZShlbmFibGVkOiBib29sZWFuKSB7XHJcbiAgICAgICAgdGhpcy5mb3JjZUNsaWNrdGhyb3VnaE1vZGUgPSBlbmFibGVkO1xyXG4gICAgICAgIGNvbnN0IGNhbnZhcyA9IHRoaXMucmVuZGVyZXIuZG9tRWxlbWVudDtcclxuXHJcbiAgICAgICAgaWYgKGVuYWJsZWQpIHtcclxuICAgICAgICAgICAgLy8gRW5hYmxlIGNsaWNrdGhyb3VnaCAtIG1ha2UgY2FudmFzIG5vbi1pbnRlcmFjdGl2ZVxyXG4gICAgICAgICAgICBjYW52YXMuc3R5bGUucG9pbnRlckV2ZW50cyA9ICdub25lJztcclxuICAgICAgICAgICAgY2FudmFzLnN0eWxlLmN1cnNvciA9ICdkZWZhdWx0JztcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBEaXNhYmxlIGNsaWNrdGhyb3VnaCAtIG1ha2UgY2FudmFzIGludGVyYWN0aXZlXHJcbiAgICAgICAgICAgIGNhbnZhcy5zdHlsZS5wb2ludGVyRXZlbnRzID0gJ2F1dG8nO1xyXG4gICAgICAgICAgICBpZiAodGhpcy5pc0hvdmVyaW5nRGljZSkge1xyXG4gICAgICAgICAgICAgICAgY2FudmFzLnN0eWxlLmN1cnNvciA9ICdncmFiJztcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNhbnZhcy5zdHlsZS5jdXJzb3IgPSAnZGVmYXVsdCc7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSW5kaXZpZHVhbCBkaWNlIHN0YXRlcyBmb3IgZW5oYW5jZWQgcm9sbCBzeXN0ZW1cclxuICAgIHByaXZhdGUgZGljZVN0YXRlczogQXJyYXk8e1xyXG4gICAgICAgIGluZGV4OiBudW1iZXI7XHJcbiAgICAgICAgdHlwZTogc3RyaW5nO1xyXG4gICAgICAgIGlzUm9sbGluZzogYm9vbGVhbjtcclxuICAgICAgICBpc0NhdWdodDogYm9vbGVhbjtcclxuICAgICAgICBpc0NvbXBsZXRlOiBib29sZWFuO1xyXG4gICAgICAgIHJlc3VsdDogbnVtYmVyIHwgbnVsbDtcclxuICAgICAgICBsYXN0TW90aW9uOiBudW1iZXI7XHJcbiAgICAgICAgc3RhYmxlVGltZTogbnVtYmVyO1xyXG4gICAgfT4gPSBbXTtcclxuICAgIHByaXZhdGUgY3VycmVudE1vbml0b3I6ICgoKSA9PiB2b2lkKSB8IG51bGwgPSBudWxsO1xyXG4gICAgcHJpdmF0ZSBvcmlnaW5hbE1hdGVyaWFsczogTWFwPG51bWJlciwgVEhSRUUuTWF0ZXJpYWwgfCBUSFJFRS5NYXRlcmlhbFtdPiA9IG5ldyBNYXAoKTtcclxuXHJcbiAgICAvLyBFbmhhbmNlZCByb2xsIG1ldGhvZCB3aXRoIGluZGl2aWR1YWwgZGljZSBkZXRlY3Rpb25cclxuICAgIHB1YmxpYyBhc3luYyByb2xsKCk6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmRpY2VBcnJheS5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICByZWplY3QobmV3IEVycm9yKCdObyBkaWNlIHRvIHJvbGwnKSk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn46yIFN0YXJ0aW5nIGVuaGFuY2VkIHJvbGwgd2l0aCAke3RoaXMuZGljZUFycmF5Lmxlbmd0aH0gZGljZWApO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIEluaXRpYWxpemUgZGljZSBzdGF0ZXNcclxuICAgICAgICAgICAgICAgIHRoaXMuaW5pdGlhbGl6ZURpY2VTdGF0ZXMoKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBBcHBseSBwaHlzaWNzIGltcHVsc2UgdG8gYWxsIGRpY2VcclxuICAgICAgICAgICAgICAgIHRoaXMuYXBwbHlSb2xsRm9yY2VzKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gU3RhcnQgbW9uaXRvcmluZyBpbmRpdmlkdWFsIGRpY2VcclxuICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRJbmRpdmlkdWFsRGljZU1vbml0b3JpbmcocmVzb2x2ZSwgcmVqZWN0KTtcclxuXHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdSb2xsIGVycm9yOicsIGVycm9yKTtcclxuICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBwcml2YXRlIGluaXRpYWxpemVEaWNlU3RhdGVzKCkge1xyXG4gICAgICAgIHRoaXMuZGljZVN0YXRlcyA9IFtdO1xyXG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5kaWNlQXJyYXkubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgdGhpcy5kaWNlU3RhdGVzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgaW5kZXg6IGksXHJcbiAgICAgICAgICAgICAgICB0eXBlOiB0aGlzLmRpY2VUeXBlQXJyYXlbaV0gfHwgJ2QyMCcsXHJcbiAgICAgICAgICAgICAgICBpc1JvbGxpbmc6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBpc0NhdWdodDogZmFsc2UsXHJcbiAgICAgICAgICAgICAgICBpc0NvbXBsZXRlOiBmYWxzZSxcclxuICAgICAgICAgICAgICAgIHJlc3VsdDogbnVsbCxcclxuICAgICAgICAgICAgICAgIGxhc3RNb3Rpb246IERhdGUubm93KCksXHJcbiAgICAgICAgICAgICAgICBzdGFibGVUaW1lOiAwXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zb2xlLmxvZyhg8J+OryBJbml0aWFsaXplZCAke3RoaXMuZGljZVN0YXRlcy5sZW5ndGh9IGRpY2Ugc3RhdGVzYCk7XHJcbiAgICB9XHJcblxyXG4gICAgcHJpdmF0ZSBhcHBseVJvbGxGb3JjZXMoKSB7XHJcbiAgICAgICAgdGhpcy5kaWNlQm9keUFycmF5LmZvckVhY2goKGJvZHksIGluZGV4KSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChib2R5KSB7XHJcbiAgICAgICAgICAgICAgICAvLyBSZXNldCBwb3NpdGlvbiB0byBwcmV2ZW50IHN0YWNraW5nXHJcbiAgICAgICAgICAgICAgICBjb25zdCBzcHJlYWQgPSBNYXRoLm1pbih0aGlzLmRpY2VBcnJheS5sZW5ndGggKiAwLjMsIDQpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYW5nbGUgPSAoaW5kZXggLyB0aGlzLmRpY2VBcnJheS5sZW5ndGgpICogTWF0aC5QSSAqIDI7XHJcbiAgICAgICAgICAgICAgICBjb25zdCByYWRpdXMgPSBzcHJlYWQgKiAwLjU7XHJcblxyXG4gICAgICAgICAgICAgICAgYm9keS5wb3NpdGlvbi5zZXQoXHJcbiAgICAgICAgICAgICAgICAgICAgTWF0aC5jb3MoYW5nbGUpICogcmFkaXVzLFxyXG4gICAgICAgICAgICAgICAgICAgIDUgKyBNYXRoLnJhbmRvbSgpICogMixcclxuICAgICAgICAgICAgICAgICAgICBNYXRoLnNpbihhbmdsZSkgKiByYWRpdXNcclxuICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgcmFuZG9tIHJvdGF0aW9uXHJcbiAgICAgICAgICAgICAgICBib2R5LnF1YXRlcm5pb24uc2V0KFxyXG4gICAgICAgICAgICAgICAgICAgIE1hdGgucmFuZG9tKCkgLSAwLjUsXHJcbiAgICAgICAgICAgICAgICAgICAgTWF0aC5yYW5kb20oKSAtIDAuNSxcclxuICAgICAgICAgICAgICAgICAgICBNYXRoLnJhbmRvbSgpIC0gMC41LFxyXG4gICAgICAgICAgICAgICAgICAgIE1hdGgucmFuZG9tKCkgLSAwLjVcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICBib2R5LnF1YXRlcm5pb24ubm9ybWFsaXplKCk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgc3Ryb25nIGltcHVsc2UgZm9yY2VcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZvcmNlTXVsdGlwbGllciA9IDE1ICsgTWF0aC5yYW5kb20oKSAqIDEwO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZm9yY2UgPSBuZXcgQ0FOTk9OLlZlYzMoXHJcbiAgICAgICAgICAgICAgICAgICAgKE1hdGgucmFuZG9tKCkgLSAwLjUpICogZm9yY2VNdWx0aXBsaWVyLFxyXG4gICAgICAgICAgICAgICAgICAgIE1hdGgucmFuZG9tKCkgKiA1LFxyXG4gICAgICAgICAgICAgICAgICAgIChNYXRoLnJhbmRvbSgpIC0gMC41KSAqIGZvcmNlTXVsdGlwbGllclxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgIGJvZHkuYXBwbHlJbXB1bHNlKGZvcmNlKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBBcHBseSByYW5kb20gdG9ycXVlXHJcbiAgICAgICAgICAgICAgICBjb25zdCB0b3JxdWUgPSBuZXcgQ0FOTk9OLlZlYzMoXHJcbiAgICAgICAgICAgICAgICAgICAgKE1hdGgucmFuZG9tKCkgLSAwLjUpICogMjAsXHJcbiAgICAgICAgICAgICAgICAgICAgKE1hdGgucmFuZG9tKCkgLSAwLjUpICogMjAsXHJcbiAgICAgICAgICAgICAgICAgICAgKE1hdGgucmFuZG9tKCkgLSAwLjUpICogMjBcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICBib2R5LmFwcGx5VG9ycXVlKHRvcnF1ZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYPCfjrIgQXBwbGllZCBmb3JjZSB0byBkaWNlICR7aW5kZXh9OiBmb3JjZT0ke2ZvcmNlLmxlbmd0aCgpLnRvRml4ZWQoMil9LCB0b3JxdWU9JHt0b3JxdWUubGVuZ3RoKCkudG9GaXhlZCgyKX1gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHByaXZhdGUgc3RhcnRJbmRpdmlkdWFsRGljZU1vbml0b3JpbmcocmVzb2x2ZTogKHZhbHVlOiBzdHJpbmcpID0+IHZvaWQsIHJlamVjdDogKHJlYXNvbj86IGFueSkgPT4gdm9pZCkge1xyXG4gICAgICAgIGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XHJcbiAgICAgICAgY29uc3QgbWF4V2FpdFRpbWUgPSAxNTAwMDsgLy8gTWF4aW11bSAxNSBzZWNvbmRzXHJcbiAgICAgICAgY29uc3QgY2hlY2tJbnRlcnZhbCA9IDEwMDsgLy8gQ2hlY2sgZXZlcnkgMTAwbXNcclxuXHJcbiAgICAgICAgY29uc3QgbW9uaXRvciA9ICgpID0+IHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XHJcbiAgICAgICAgICAgICAgICBsZXQgYWxsQ29tcGxldGUgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgbGV0IHN0YXR1c1VwZGF0ZSA9ICcnO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGVhY2ggZGllIGluZGl2aWR1YWxseVxyXG4gICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmRpY2VTdGF0ZXMubGVuZ3RoOyBpKyspIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBzdGF0ZSA9IHRoaXMuZGljZVN0YXRlc1tpXTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBib2R5ID0gdGhpcy5kaWNlQm9keUFycmF5W2ldO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXN0YXRlLmlzQ29tcGxldGUgJiYgYm9keSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBDYWxjdWxhdGUgbW90aW9uICh2ZWxvY2l0eSArIGFuZ3VsYXIgdmVsb2NpdHkpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGxpbmVhclZlbCA9IGJvZHkudmVsb2NpdHkubGVuZ3RoKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFuZ3VsYXJWZWwgPSBib2R5LmFuZ3VsYXJWZWxvY2l0eS5sZW5ndGgoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdG90YWxNb3Rpb24gPSBsaW5lYXJWZWwgKyBhbmd1bGFyVmVsO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgZGljZSBoYXMgc2V0dGxlZFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodG90YWxNb3Rpb24gPCB0aGlzLnNldHRpbmdzLm1vdGlvblRocmVzaG9sZCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXRlLnN0YWJsZVRpbWUgPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5zdGFibGVUaW1lID0gbm93O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChub3cgLSBzdGF0ZS5zdGFibGVUaW1lID4gMjAwMCAmJiAhc3RhdGUuaXNDYXVnaHQgJiYgIXN0YXRlLmlzQ29tcGxldGUpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBEaWNlIGhhcyBiZWVuIHN0YWJsZSBmb3IgMiBzZWNvbmRzIC0gTk9XIGNoZWNrIGlmIGl0IGNhbiBiZSBkZXRlcm1pbmVkXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2hlY2tSZXN1bHQgPSB0aGlzLmNoZWNrRGljZVJlc3VsdChpKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGNoZWNrUmVzdWx0LmlzQ2F1Z2h0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZhY2UgZGV0ZWN0aW9uIGZhaWxlZCAtIGRpY2UgaXMgQ0FVR0hUIChkb24ndCBtYXJrIGFzIGNvbXBsZXRlLCB3YWl0IGZvciByZXJvbGwpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmlzQ2F1Z2h0ID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUuaXNSb2xsaW5nID0gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLnJlc3VsdCA9IG51bGw7IC8vIE5vIHZhbGlkIHJlc3VsdFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+lhSBEaWNlICR7aX0gKCR7c3RhdGUudHlwZX0pIENBVUdIVCEgRmFjZSBjb25maWRlbmNlOiAke2NoZWNrUmVzdWx0LmNvbmZpZGVuY2UudG9GaXhlZCgzKX0sIHJlcXVpcmVkOiAke2NoZWNrUmVzdWx0LnJlcXVpcmVkQ29uZmlkZW5jZS50b0ZpeGVkKDMpfWApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBIaWdobGlnaHQgaW1tZWRpYXRlbHkgd2hlbiBjYXVnaHRcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5oaWdobGlnaHRDYXVnaHREaWNlKGksIHRydWUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZhY2UgZGV0ZWN0aW9uIHN1Y2NlZWRlZCAtIGRpY2UgY29tcGxldGVzIHdpdGggcmVzdWx0XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLnJlc3VsdCA9IGNoZWNrUmVzdWx0LnJlc3VsdDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUuaXNDb21wbGV0ZSA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmlzUm9sbGluZyA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg4pyFIERpY2UgJHtpfSAoJHtzdGF0ZS50eXBlfSkgc2V0dGxlZCB3aXRoIHJlc3VsdDogJHtjaGVja1Jlc3VsdC5yZXN1bHR9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gRGljZSBpcyBtb3ZpbmcgYWdhaW4gLSByZXNldCBzdGFiaWxpdHkgdGltZXJcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLnN0YWJsZVRpbWUgPSAwO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdGUubGFzdE1vdGlvbiA9IG5vdztcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBJZiBkaWNlIHdhcyBtYXJrZWQgYXMgY2F1Z2h0IGJ1dCBpcyBtb3ZpbmcgYWdhaW4sIGdpdmUgaXQgYW5vdGhlciBjaGFuY2VcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdGF0ZS5pc0NhdWdodCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5SEIERpY2UgJHtpfSB3YXMgY2F1Z2h0IGJ1dCBpcyBtb3ZpbmcgYWdhaW4gLSBjbGVhcmluZyBjYXVnaHQgc3RhdGVgKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGF0ZS5pc0NhdWdodCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0YXRlLmlzUm9sbGluZyA9IHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5oaWdobGlnaHRDYXVnaHREaWNlKGksIGZhbHNlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFzdGF0ZS5pc0NvbXBsZXRlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhbGxDb21wbGV0ZSA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSBzdGF0dXNcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNvbXBsZXRlZCA9IHRoaXMuZGljZVN0YXRlcy5maWx0ZXIoZCA9PiBkLmlzQ29tcGxldGUpLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGNhdWdodCA9IHRoaXMuZGljZVN0YXRlcy5maWx0ZXIoZCA9PiBkLmlzQ2F1Z2h0ICYmICFkLmlzQ29tcGxldGUpLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJvbGxpbmcgPSB0aGlzLmRpY2VTdGF0ZXMuZmlsdGVyKGQgPT4gZC5pc1JvbGxpbmcgJiYgIWQuaXNDYXVnaHQgJiYgIWQuaXNDb21wbGV0ZSkubGVuZ3RoO1xyXG5cclxuICAgICAgICAgICAgICAgIHN0YXR1c1VwZGF0ZSA9IGBSb2xsaW5nOiAke3JvbGxpbmd9LCBDYXVnaHQ6ICR7Y2F1Z2h0fSwgQ29tcGxldGU6ICR7Y29tcGxldGVkfS8ke3RoaXMuZGljZVN0YXRlcy5sZW5ndGh9YDtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBPbmx5IGxvZyBzdGF0dXMgb2NjYXNpb25hbGx5IHRvIGF2b2lkIHNwYW1cclxuICAgICAgICAgICAgICAgIGlmIChNYXRoLnJhbmRvbSgpIDwgMC4xKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYPCfjq8gU3RhdHVzIC0gJHtzdGF0dXNVcGRhdGV9YCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlcmUgYXJlIGNhdWdodCBkaWNlLCBET04nVCBzaG93IHJlc3VsdHMgeWV0IC0gd2FpdCBmb3IgcmVyb2xsXHJcbiAgICAgICAgICAgICAgICBpZiAoY2F1Z2h0ID4gMCAmJiByb2xsaW5nID09PSAwKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQWxsIGRpY2UgaGF2ZSBzZXR0bGVkLCBidXQgc29tZSBhcmUgY2F1Z2h0IC0gd2FpdCBmb3IgdXNlciB0byByZXJvbGxcclxuICAgICAgICAgICAgICAgICAgICBpZiAoY29tcGxldGVkID4gMCAmJiBNYXRoLnJhbmRvbSgpIDwgMC4wNSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhg4o+477iPIFdhaXRpbmcgZm9yIHJlcm9sbCAtICR7Y2F1Z2h0fSBkaWNlIGNhdWdodCwgJHtjb21wbGV0ZWR9IGRpY2UgdmFsaWRgKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQ29udGludWUgbW9uaXRvcmluZyBidXQgZG9uJ3QgcmVzb2x2ZVxyXG4gICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQobW9uaXRvciwgY2hlY2tJbnRlcnZhbCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIGFsbCBkaWNlIGFyZSBjb21wbGV0ZSAoYW5kIG5vbmUgYXJlIGNhdWdodClcclxuICAgICAgICAgICAgICAgIGlmIChhbGxDb21wbGV0ZSAmJiBjYXVnaHQgPT09IDApIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBBbGwgZGljZSBoYXZlIHZhbGlkIHJlc3VsdHMgLSBzaG93IGZpbmFsIHJlc3VsdFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdHMgPSB0aGlzLmRpY2VTdGF0ZXMubWFwKGQgPT4gZC5yZXN1bHQpLmZpbHRlcihyID0+IHIgIT09IG51bGwpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRvdGFsID0gcmVzdWx0cy5yZWR1Y2UoKHN1bSwgdmFsKSA9PiBzdW0gKyB2YWwhLCAwKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgYnJlYWtkb3duID0gdGhpcy5kaWNlU3RhdGVzXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC5tYXAoKHN0YXRlLCBpKSA9PiBgJHtzdGF0ZS50eXBlfT0ke3N0YXRlLnJlc3VsdH1gKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAuam9pbignICsgJyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdFN0cmluZyA9IGAke2JyZWFrZG93bn0gPSAke3RvdGFsfWA7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYPCfj4YgQWxsIGRpY2UgY29tcGxldGUhIFJlc3VsdDogJHtyZXN1bHRTdHJpbmd9YCk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIENsZWFyIG1vbml0b3Jpbmcgc3RhdGVcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRNb25pdG9yID0gbnVsbDtcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmRpY2VTdGF0ZXMgPSBbXTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShyZXN1bHRTdHJpbmcpO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAvLyBDaGVjayBmb3IgdGltZW91dFxyXG4gICAgICAgICAgICAgICAgaWYgKG5vdyAtIHN0YXJ0VGltZSA+IG1heFdhaXRUaW1lKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYOKPsCBSb2xsIHRpbWVvdXQgYWZ0ZXIgJHttYXhXYWl0VGltZS8xMDAwfXNgKTtcclxuICAgICAgICAgICAgICAgICAgICAvLyBGb3JjZSBjb21wbGV0aW9uIHdpdGggY3VycmVudCByZXN1bHRzXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGFydGlhbFJlc3VsdHMgPSB0aGlzLmRpY2VTdGF0ZXMubWFwKChzdGF0ZSwgaSkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RhdGUucmVzdWx0ICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3RhdGUucmVzdWx0O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9yY2UgZGV0ZWN0IHJlc3VsdCBmb3IgaW5jb21wbGV0ZSBkaWNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRUb3BGYWNlTnVtYmVyRm9yRGljZShpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRvdGFsID0gcGFydGlhbFJlc3VsdHMucmVkdWNlKChzdW0sIHZhbCkgPT4gc3VtICsgdmFsLCAwKTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBicmVha2Rvd24gPSBwYXJ0aWFsUmVzdWx0c1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAubWFwKChyZXN1bHQsIGkpID0+IGAke3RoaXMuZGljZVN0YXRlc1tpXS50eXBlfT0ke3Jlc3VsdH1gKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAuam9pbignICsgJyk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIENsZWFyIGFsbCBoaWdobGlnaHRzIGJlZm9yZSByZXNvbHZpbmdcclxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNsZWFyQWxsSGlnaGxpZ2h0cygpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyBDbGVhciBtb25pdG9yaW5nIHN0YXRlXHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50TW9uaXRvciA9IG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kaWNlU3RhdGVzID0gW107XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIHJlc29sdmUoYCR7YnJlYWtkb3dufSA9ICR7dG90YWx9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIENvbnRpbnVlIG1vbml0b3JpbmdcclxuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQobW9uaXRvciwgY2hlY2tJbnRlcnZhbCk7XHJcblxyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignTW9uaXRvcmluZyBlcnJvcjonLCBlcnJvcik7XHJcbiAgICAgICAgICAgICAgICAvLyBDbGVhciBtb25pdG9yaW5nIHN0YXRlIG9uIGVycm9yXHJcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnRNb25pdG9yID0gbnVsbDtcclxuICAgICAgICAgICAgICAgIHRoaXMuZGljZVN0YXRlcyA9IFtdO1xyXG4gICAgICAgICAgICAgICAgcmVqZWN0KGVycm9yKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIC8vIFN0b3JlIHRoZSBtb25pdG9yIGZ1bmN0aW9uIHNvIGl0IGNhbiBiZSByZXN1bWVkIGFmdGVyIHJlcm9sbFxyXG4gICAgICAgIHRoaXMuY3VycmVudE1vbml0b3IgPSBtb25pdG9yO1xyXG5cclxuICAgICAgICAvLyBTdGFydCBtb25pdG9yaW5nXHJcbiAgICAgICAgbW9uaXRvcigpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIE1ldGhvZCB0byBtYW51YWxseSByZXJvbGwgY2F1Z2h0IGRpY2VcclxuICAgIHB1YmxpYyByZXJvbGxDYXVnaHREaWNlKCk6IGJvb2xlYW4ge1xyXG4gICAgICAgIGNvbnN0IGNhdWdodERpY2UgPSB0aGlzLmRpY2VTdGF0ZXMuZmlsdGVyKGQgPT4gZC5pc0NhdWdodCAmJiAhZC5pc0NvbXBsZXRlKTtcclxuXHJcbiAgICAgICAgaWYgKGNhdWdodERpY2UubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdObyBjYXVnaHQgZGljZSB0byByZXJvbGwnKTtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coYPCfjrIgUmVyb2xsaW5nICR7Y2F1Z2h0RGljZS5sZW5ndGh9IGNhdWdodCBkaWNlYCk7XHJcblxyXG4gICAgICAgIGNhdWdodERpY2UuZm9yRWFjaChzdGF0ZSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IGJvZHkgPSB0aGlzLmRpY2VCb2R5QXJyYXlbc3RhdGUuaW5kZXhdO1xyXG4gICAgICAgICAgICBpZiAoYm9keSkge1xyXG4gICAgICAgICAgICAgICAgLy8gUmVtb3ZlIGhpZ2hsaWdodCBmcm9tIGNhdWdodCBkaWNlXHJcbiAgICAgICAgICAgICAgICB0aGlzLmhpZ2hsaWdodENhdWdodERpY2Uoc3RhdGUuaW5kZXgsIGZhbHNlKTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBSZXNldCBkaWNlIHN0YXRlXHJcbiAgICAgICAgICAgICAgICBzdGF0ZS5pc0NhdWdodCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgc3RhdGUuaXNSb2xsaW5nID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIHN0YXRlLnN0YWJsZVRpbWUgPSAwO1xyXG4gICAgICAgICAgICAgICAgc3RhdGUubGFzdE1vdGlvbiA9IERhdGUubm93KCk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgbmV3IGZvcmNlIHRvIGNhdWdodCBkaWNlIC0gZW5zdXJlIHRoZXkgZmFsbCBkb3duXHJcbiAgICAgICAgICAgICAgICBjb25zdCBmb3JjZU11bHRpcGxpZXIgPSAxMCArIE1hdGgucmFuZG9tKCkgKiA4O1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZm9yY2UgPSBuZXcgQ0FOTk9OLlZlYzMoXHJcbiAgICAgICAgICAgICAgICAgICAgKE1hdGgucmFuZG9tKCkgLSAwLjUpICogZm9yY2VNdWx0aXBsaWVyLFxyXG4gICAgICAgICAgICAgICAgICAgIC01LCAvLyBTdHJvbmcgZG93bndhcmQgZm9yY2UgdG8gcHJldmVudCByZWNhdGNoaW5nXHJcbiAgICAgICAgICAgICAgICAgICAgKE1hdGgucmFuZG9tKCkgLSAwLjUpICogZm9yY2VNdWx0aXBsaWVyXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgYm9keS5hcHBseUltcHVsc2UoZm9yY2UpO1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5SEIFJlcm9sbGVkIGRpY2UgJHtzdGF0ZS5pbmRleH0gd2l0aCBmb3JjZSAke2ZvcmNlLmxlbmd0aCgpLnRvRml4ZWQoMil9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gR2V0IGN1cnJlbnQgZGljZSBzdGF0dXMgZm9yIFVJIHVwZGF0ZXNcclxuICAgIHB1YmxpYyBnZXREaWNlU3RhdHVzKCk6IEFycmF5PHtpbmRleDogbnVtYmVyLCB0eXBlOiBzdHJpbmcsIHN0YXR1czogc3RyaW5nLCByZXN1bHQ/OiBudW1iZXJ9PiB7XHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZGljZVN0YXRlcy5tYXAoc3RhdGUgPT4gKHtcclxuICAgICAgICAgICAgaW5kZXg6IHN0YXRlLmluZGV4LFxyXG4gICAgICAgICAgICB0eXBlOiBzdGF0ZS50eXBlLFxyXG4gICAgICAgICAgICBzdGF0dXM6IHN0YXRlLmlzQ29tcGxldGUgPyAnY29tcGxldGUnIDpcclxuICAgICAgICAgICAgICAgICAgIHN0YXRlLmlzQ2F1Z2h0ID8gJ2NhdWdodCcgOlxyXG4gICAgICAgICAgICAgICAgICAgc3RhdGUuaXNSb2xsaW5nID8gJ3JvbGxpbmcnIDogJ3Vua25vd24nLFxyXG4gICAgICAgICAgICByZXN1bHQ6IHN0YXRlLnJlc3VsdCB8fCB1bmRlZmluZWRcclxuICAgICAgICB9KSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSGlnaGxpZ2h0IGNhdWdodCBkaWNlIHdpdGggZW1pc3NpdmUgZ2xvd1xyXG4gICAgcHJpdmF0ZSBoaWdobGlnaHRDYXVnaHREaWNlKGluZGV4OiBudW1iZXIsIGhpZ2hsaWdodDogYm9vbGVhbikge1xyXG4gICAgICAgIGNvbnN0IGRpY2UgPSB0aGlzLmRpY2VBcnJheVtpbmRleF07XHJcbiAgICAgICAgaWYgKCFkaWNlKSByZXR1cm47XHJcblxyXG4gICAgICAgIGlmIChoaWdobGlnaHQpIHtcclxuICAgICAgICAgICAgLy8gU3RvcmUgb3JpZ2luYWwgbWF0ZXJpYWwgaWYgbm90IGFscmVhZHkgc3RvcmVkXHJcbiAgICAgICAgICAgIGlmICghdGhpcy5vcmlnaW5hbE1hdGVyaWFscy5oYXMoaW5kZXgpKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm9yaWdpbmFsTWF0ZXJpYWxzLnNldChpbmRleCwgZGljZS5tYXRlcmlhbCk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIENyZWF0ZSBoaWdobGlnaHRlZCBtYXRlcmlhbCB3aXRoIG9yYW5nZSBnbG93XHJcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRNYXRlcmlhbCA9IEFycmF5LmlzQXJyYXkoZGljZS5tYXRlcmlhbCkgPyBkaWNlLm1hdGVyaWFsWzBdIDogZGljZS5tYXRlcmlhbDtcclxuICAgICAgICAgICAgY29uc3QgaGlnaGxpZ2h0ZWRNYXRlcmlhbCA9IChjdXJyZW50TWF0ZXJpYWwgYXMgVEhSRUUuTWVzaFN0YW5kYXJkTWF0ZXJpYWwpLmNsb25lKCk7XHJcbiAgICAgICAgICAgIGhpZ2hsaWdodGVkTWF0ZXJpYWwuZW1pc3NpdmUuc2V0SGV4KDB4ZmY2NjAwKTsgLy8gT3JhbmdlIGdsb3dcclxuICAgICAgICAgICAgaGlnaGxpZ2h0ZWRNYXRlcmlhbC5lbWlzc2l2ZUludGVuc2l0eSA9IDAuODtcclxuICAgICAgICAgICAgZGljZS5tYXRlcmlhbCA9IGhpZ2hsaWdodGVkTWF0ZXJpYWw7XHJcblxyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhg8J+UhiBIaWdobGlnaHRlZCBjYXVnaHQgZGljZSAke2luZGV4fWApO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIFJlc3RvcmUgb3JpZ2luYWwgbWF0ZXJpYWxcclxuICAgICAgICAgICAgY29uc3Qgb3JpZ2luYWxNYXRlcmlhbCA9IHRoaXMub3JpZ2luYWxNYXRlcmlhbHMuZ2V0KGluZGV4KTtcclxuICAgICAgICAgICAgaWYgKG9yaWdpbmFsTWF0ZXJpYWwpIHtcclxuICAgICAgICAgICAgICAgIGRpY2UubWF0ZXJpYWwgPSBvcmlnaW5hbE1hdGVyaWFsO1xyXG4gICAgICAgICAgICAgICAgdGhpcy5vcmlnaW5hbE1hdGVyaWFscy5kZWxldGUoaW5kZXgpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYPCflIUgUmVtb3ZlZCBoaWdobGlnaHQgZnJvbSBkaWNlICR7aW5kZXh9YCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2xlYXIgYWxsIGhpZ2hsaWdodHNcclxuICAgIHByaXZhdGUgY2xlYXJBbGxIaWdobGlnaHRzKCkge1xyXG4gICAgICAgIHRoaXMub3JpZ2luYWxNYXRlcmlhbHMuZm9yRWFjaCgob3JpZ2luYWxNYXRlcmlhbCwgaW5kZXgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZGljZSA9IHRoaXMuZGljZUFycmF5W2luZGV4XTtcclxuICAgICAgICAgICAgaWYgKGRpY2UpIHtcclxuICAgICAgICAgICAgICAgIGRpY2UubWF0ZXJpYWwgPSBvcmlnaW5hbE1hdGVyaWFsO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgdGhpcy5vcmlnaW5hbE1hdGVyaWFscy5jbGVhcigpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKCfwn5SFIENsZWFyZWQgYWxsIGRpY2UgaGlnaGxpZ2h0cycpO1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuXHJcblxyXG5cclxuIl19