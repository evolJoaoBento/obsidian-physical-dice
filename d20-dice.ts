import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { DiceSettings } from './settings';

export class D20Dice {
    private scene: THREE.Scene;
    private camera: THREE.OrthographicCamera;
    private renderer: THREE.WebGLRenderer;
    private dice: THREE.Mesh;
    private diceBody: CANNON.Body;
    private world: CANNON.World;
    private isRolling = false;
    private container: HTMLElement;
    private animationId: number | null = null;
    private rollTimeout: NodeJS.Timeout | null = null;
    private isDragging = false;
    private dragStartPosition = { x: 0, y: 0 };
    private mouse = new THREE.Vector2();
    private raycaster = new THREE.Raycaster();
    private lastMousePosition = { x: 0, y: 0, time: 0 };
    private mouseVelocity = { x: 0, y: 0 };
    private isHoveringDice = false;
    private diceGeometry: THREE.IcosahedronGeometry;
    private faceNumbers: number[] = [];
    private faceNormals: THREE.Vector3[] = [];
    private settings: DiceSettings;
    // Multi-dice support arrays
    private diceArray: THREE.Mesh[] = [];
    private diceBodyArray: CANNON.Body[] = [];
    private diceTypeArray: string[] = [];
    private selectedDice: THREE.Mesh[] = [];
    private draggedDiceIndex = -1;
    private trayMesh: THREE.Mesh | null = null;
    private windowBorder: HTMLElement | null = null;
    private hoverCircle: THREE.Mesh | null = null;
    private hoverCircleMaterial: THREE.MeshBasicMaterial | null = null;
    private floorHeight = -2.4;
    private forceClickthroughMode = false;
    public onRollComplete: ((result: number | string) => void) | null = null;
    private ambientLight: THREE.AmbientLight | null = null;
    private directionalLight: THREE.DirectionalLight | null = null;
    public isViewActive: boolean = true; // Track if the view is active

    constructor(container: HTMLElement, settings: DiceSettings) {
        this.container = container;
        this.settings = settings;
        console.log('🎲 D20Dice initialized with settings:', {
            motionThreshold: settings.motionThreshold,
            enableResultAnimation: settings.enableResultAnimation,
            diceSize: settings.diceSize
        });
        this.init();
    }

    private init() {
        try {
            // Initialize Three.js scene with transparent background
            this.scene = new THREE.Scene();
            // No background color - will be transparent

            // Setup orthographic camera - will be properly sized in updateSize
            const aspect = window.innerWidth / (window.innerHeight - 44);
            const frustumSize = 20;
            this.camera = new THREE.OrthographicCamera(
                -frustumSize * aspect / 2, frustumSize * aspect / 2,
                frustumSize / 2, -frustumSize / 2,
                0.1, 1000
            );
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
        } catch (error) {
            console.error('Failed to initialize D20 dice:', error);
            console.error('Error details:', error.message, error.stack);
            this.container.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted);">3D rendering not available<br><small>Error: ${error.message}</small></div>`;
        }
    }

    private initPhysics() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0); // Realistic Earth gravity (9.82 m/s²)
        console.log(`🌍 Physics world initialized with gravity: ${this.world.gravity.y}`);

        // Set up advanced physics for more accurate simulation
        this.world.broadphase.useBoundingBoxes = true;
        this.world.defaultContactMaterial.contactEquationStiffness = 1e7;
        this.world.defaultContactMaterial.contactEquationRelaxation = 4;
        this.world.broadphase = new CANNON.NaiveBroadphase();
    }

    private createDiceTray() {
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
        floorMaterial.restitution = 0.25;  // Felt absorbs energy (low bounce)
        floorMaterial.friction = 0.7;      // Felt has high friction

        const floorShape = new CANNON.Plane();
        const floorBody = new CANNON.Body({ mass: 0, material: floorMaterial });
        floorBody.addShape(floorShape);
        floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        floorBody.position.set(0, -2.4, 0);
        this.floorHeight = floorBody.position.y;
        this.world.addBody(floorBody);

        // Physics tray walls - realistic wood/plastic walls
        const wallMaterial = new CANNON.Material('wall');
        wallMaterial.restitution = 0.45;  // Moderate bounce off walls
        wallMaterial.friction = 0.3;      // Smooth wall surface

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

    private createDice() {
        // DISABLED: Legacy single-dice creation method
        // Multi-dice system uses createSingleDice() instead
        console.log('createDice() called but disabled for multi-dice system');
        return;

        // Create a basic fallback material with all configured properties
        const fallbackMaterialProps: any = {
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

    private createDiceGeometry(): THREE.BufferGeometry {
        let geometry: THREE.BufferGeometry;

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

    private createD10PolyhedronGeometry(size: number): THREE.BufferGeometry {
        // Based on react-3d-dice implementation
        const sides = 10;
        const vertices: number[] = [0, 0, 1, 0, 0, -1];

        // Create vertices around the middle
        for (let i = 0; i < sides; ++i) {
            const angle = (i * Math.PI * 2) / sides;
            vertices.push(
                -Math.cos(angle),
                -Math.sin(angle),
                0.105 * (i % 2 ? 1 : -1)
            );
        }

        // Define faces (triangles) - based on react-3d-dice
        const faces = [
            [0, 2, 3], [0, 3, 4], [0, 4, 5], [0, 5, 6], [0, 6, 7],
            [0, 7, 8], [0, 8, 9], [0, 9, 10], [0, 10, 11], [0, 11, 2],
            [1, 3, 2], [1, 4, 3], [1, 5, 4], [1, 6, 5], [1, 7, 6],
            [1, 8, 7], [1, 9, 8], [1, 10, 9], [1, 11, 10], [1, 2, 11]
        ];

        // Create THREE.js PolyhedronGeometry
        const geometry = new THREE.PolyhedronGeometry(
            vertices,
            faces.flat(),
            size,
            0  // Detail level 0 for sharp edges
        );

        return geometry;
    }

    private applyD10UVMapping(geometry: THREE.BufferGeometry): void {
        // Convert to non-indexed geometry
        const nonIndexedGeometry = geometry.toNonIndexed();
        geometry.attributes = nonIndexedGeometry.attributes;
        geometry.index = null;

        const uvAttribute = geometry.attributes.uv;
        const uvArray = uvAttribute.array as Float32Array;
        const positionAttribute = geometry.attributes.position;
        const positionArray = positionAttribute.array as Float32Array;

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
            const v1 = new THREE.Vector3(
                positionArray[vertexOffset * 3],
                positionArray[vertexOffset * 3 + 1],
                positionArray[vertexOffset * 3 + 2]
            );
            const v2 = new THREE.Vector3(
                positionArray[(vertexOffset + 1) * 3],
                positionArray[(vertexOffset + 1) * 3 + 1],
                positionArray[(vertexOffset + 1) * 3 + 2]
            );
            const v3 = new THREE.Vector3(
                positionArray[(vertexOffset + 2) * 3],
                positionArray[(vertexOffset + 2) * 3 + 1],
                positionArray[(vertexOffset + 2) * 3 + 2]
            );

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

            const isTopFace = faceIndex >= 1 && faceIndex <=4;

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
                        { x: cellCenterX, y: cellTop },        // Top vertex (0)
                        { x: cellLeft, y: kiteCenter },       // Right vertex (1) - at 80% point
                        { x: cellCenterX, y: cellBottom },     // Bottom vertex (2)
                        { x: cellRight, y: kiteCenter }         // Left vertex (3) - at 80% point
                    ];
                    if (t === 0) {
                        // First triangle
                        uvArray[uvIndex] = kiteVertices[3].x;
                        uvArray[uvIndex + 1] = kiteVertices[3].y;
                        uvArray[uvIndex + 2] = kiteVertices[2].x;
                        uvArray[uvIndex + 3] = kiteVertices[2].y;
                        uvArray[uvIndex + 4] = kiteVertices[0].x;
                        uvArray[uvIndex + 5] = kiteVertices[0].y;
                    } else if (t === 1) {
                        // Second triangle
                        uvArray[uvIndex] = kiteVertices[2].x;
                        uvArray[uvIndex + 1] = kiteVertices[2].y;
                        uvArray[uvIndex + 2] = kiteVertices[1].x;
                        uvArray[uvIndex + 3] = kiteVertices[1].y;
                        uvArray[uvIndex + 4] = kiteVertices[0].x;
                        uvArray[uvIndex + 5] = kiteVertices[0].y;
                    }
                } else {
                    kiteVertices = [
                        { x: cellCenterX, y: cellBottom },        // Top vertex (0)
                        { x: cellRight, y: kiteCenter },       // Right vertex (1) - at 80% point
                        { x: cellCenterX, y: cellTop },     // Bottom vertex (2)
                        { x: cellLeft, y: kiteCenter }         // Left vertex (3) - at 80% point
                    ];
                    if (t === 0) {
                        // First triangle
                        uvArray[uvIndex] = kiteVertices[0].x;
                        uvArray[uvIndex + 1] = kiteVertices[0].y;
                        uvArray[uvIndex + 2] = kiteVertices[3].x;
                        uvArray[uvIndex + 3] = kiteVertices[3].y;
                        uvArray[uvIndex + 4] = kiteVertices[2].x;
                        uvArray[uvIndex + 5] = kiteVertices[2].y;
                    } else if (t === 1) {
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

    private createPentagonalTrapezohedronGeometry(size: number): THREE.BufferGeometry {
        const geometry = new THREE.BufferGeometry();
        const topHeight = size * 0.75;
        const bottomHeight = -topHeight;
        const ringRadius = size * 0.9;

        const topVertices: THREE.Vector3[] = [];
        const bottomVertices: THREE.Vector3[] = [];

        for (let i = 0; i < 5; i++) {
            const angle = (i * Math.PI * 2) / 5;
            topVertices.push(new THREE.Vector3(Math.cos(angle) * ringRadius, topHeight, Math.sin(angle) * ringRadius));
            const bottomAngle = angle + Math.PI / 5;
            bottomVertices.push(new THREE.Vector3(Math.cos(bottomAngle) * ringRadius, bottomHeight, Math.sin(bottomAngle) * ringRadius));
        }

        const positions: number[] = [];
        const uvs: number[] = [];

        const addTriangle = (v1: THREE.Vector3, uv1: [number, number], v2: THREE.Vector3, uv2: [number, number], v3: THREE.Vector3, uv3: [number, number]) => {
            positions.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);
            uvs.push(uv1[0], uv1[1], uv2[0], uv2[1], uv3[0], uv3[1]);
        };

        const cols = 5;
        const rows = 2;
        const cellWidth = 1 / cols;
        const cellHeight = 1 / rows;
        const padding = 0.02;

        const getCell = (faceIndex: number) => {
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

    private applyTriangleUVMapping(geometry: THREE.BufferGeometry, faceCount: number): void {
        // Convert to non-indexed geometry so each face has its own vertices
        const nonIndexedGeometry = geometry.toNonIndexed();
        geometry.attributes = nonIndexedGeometry.attributes;
        geometry.index = null;

        const uvAttribute = geometry.attributes.uv;
        const uvArray = uvAttribute.array as Float32Array;

        // Define UV layout in a grid that matches the template generation
        let cols, rows;
        if (faceCount === 4) {
            // D4: 2x2 grid to match template
            cols = 2;
            rows = 2;
        } else if (faceCount === 8) {
            // D8: 3x3 grid to match template
            cols = 3;
            rows = 3;
        } else if (faceCount === 12) {
            // D12: 4x3 grid to match template
            cols = 4;
            rows = 3;
        } else if (faceCount === 20) {
            // D20: 5x4 grid to match template
            cols = 5;
            rows = 4;
        } else {
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

    private applyTetrahedronUVMapping(geometry: THREE.BufferGeometry): void {
        // Convert to non-indexed geometry for proper UV mapping
        const nonIndexedGeometry = geometry.toNonIndexed();
        geometry.attributes = nonIndexedGeometry.attributes;
        geometry.index = null;

        console.log('Applying tetrahedron UV mapping for D4');

        const uvAttribute = geometry.attributes.uv;
        const uvArray = uvAttribute.array as Float32Array;

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

    private applySquareUVMapping(geometry: THREE.BufferGeometry): void {
        // BoxGeometry has 6 faces, each with 2 triangles (12 triangles total)
        const uvAttribute = geometry.attributes.uv;
        const uvArray = uvAttribute.array as Float32Array;

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
                [cellLeft, cellBottom],     // Bottom-left
                [cellRight, cellBottom],    // Bottom-right
                [cellLeft, cellTop],        // Top-left
                [cellRight, cellTop]        // Top-right
            ];

            // Apply UV coordinates to each vertex of this face
            for (let vertexIndex = 0; vertexIndex < 4; vertexIndex++) {
                const uvIndex = (faceVertexStart + vertexIndex) * 2;
                uvArray[uvIndex] = uvCoords[vertexIndex][0];     // U coordinate
                uvArray[uvIndex + 1] = uvCoords[vertexIndex][1]; // V coordinate
            }
        }

        uvAttribute.needsUpdate = true;
        console.log('Applied square UV mapping for D6 with 3x2 grid layout');
    }

    private applyD12PentagonUVMapping(geometry: THREE.BufferGeometry): void {
        // Convert to non-indexed geometry so each triangle has its own vertices
        const nonIndexedGeometry = geometry.toNonIndexed();
        geometry.attributes = nonIndexedGeometry.attributes;
        geometry.index = null;

        const uvAttribute = geometry.attributes.uv;
        const uvArray = uvAttribute.array as Float32Array;

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
                } else if (trianglesPerFace === 3) {
                    // 3 triangles per face: fan from v1 (top vertex)
                    if (localTriangle === 0) {
                        // Third triangle: v1, v4, v5
                        uvArray[uvIndex] = pentagonVertices[4].x;     // v1 (top)
                        uvArray[uvIndex + 1] = pentagonVertices[4].y;
                        uvArray[uvIndex + 2] = pentagonVertices[0].x; // v4
                        uvArray[uvIndex + 3] = pentagonVertices[0].y;
                        uvArray[uvIndex + 4] = pentagonVertices[3].x; // v5
                        uvArray[uvIndex + 5] = pentagonVertices[3].y;
                    } else if (localTriangle === 1) {
                        // Second triangle: v1, v3, v4
                        uvArray[uvIndex] = pentagonVertices[2].x;     // v1 (top)
                        uvArray[uvIndex + 1] = pentagonVertices[2].y;
                        uvArray[uvIndex + 2] = pentagonVertices[3].x; // v3
                        uvArray[uvIndex + 3] = pentagonVertices[3].y;
                        uvArray[uvIndex + 4] = pentagonVertices[0].x; // v4
                        uvArray[uvIndex + 5] = pentagonVertices[0].y;
                    } else if (localTriangle === 2) {
                        // First triangle: v1, v2, v3
                        uvArray[uvIndex] = pentagonVertices[0].x;     // v1 (top)
                        uvArray[uvIndex + 1] = pentagonVertices[0].y;
                        uvArray[uvIndex + 2] = pentagonVertices[1].x; // v2 (clockwise from v1)
                        uvArray[uvIndex + 3] = pentagonVertices[1].y;
                        uvArray[uvIndex + 4] = pentagonVertices[2].x; // v3 (clockwise from v2)
                        uvArray[uvIndex + 5] = pentagonVertices[2].y;
                        
                    }
                } else {
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

    private getFaceCountForDiceType(diceType: string): number {
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

    createSingleDice(diceType: string): void {
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

    private createGeometryForDiceType(diceType: string): THREE.BufferGeometry {
        const baseSize = this.settings.diceSize;
        const scale = this.settings.diceScales[diceType as keyof typeof this.settings.diceScales] || 1.0;
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

    private applyUVMappingForDiceType(geometry: THREE.BufferGeometry, diceType: string): void {
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

    private createMaterialForDiceType(diceType: string): THREE.MeshPhongMaterial {
        const materialProps: any = {
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

    private getDiceTextureDataForType(diceType: string): string | null {
        return this.settings.diceTextures[diceType as keyof typeof this.settings.diceTextures] || null;
    }

    private getDiceNormalMapDataForType(diceType: string): string | null {
        return this.settings.diceNormalMaps[diceType as keyof typeof this.settings.diceNormalMaps] || null;
    }

    private loadTextureFromData(textureData: string): THREE.Texture | null {
        try {
            const loader = new THREE.TextureLoader();
            const texture = loader.load(textureData);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            return texture;
        } catch (error) {
            console.warn('Failed to load dice texture:', error);
            return null;
        }
    }

    private loadNormalMapFromData(normalMapData: string): THREE.Texture | null {
        try {
            const loader = new THREE.TextureLoader();
            const normalMap = loader.load(normalMapData);
            normalMap.wrapS = THREE.RepeatWrapping;
            normalMap.wrapT = THREE.RepeatWrapping;
            return normalMap;
        } catch (error) {
            console.warn('Failed to load dice normal map:', error);
            return null;
        }
    }

    private createPhysicsBodyForDiceType(diceType: string): CANNON.Body {
        const baseSize = this.settings.diceSize;
        const scale = this.settings.diceScales[diceType as keyof typeof this.settings.diceScales] || 1.0;
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
        console.log(`🎲 Created dice body: mass=${body.mass}, friction=${body.material?.friction}, restitution=${body.material?.restitution}, linearDamping=${body.linearDamping}, angularDamping=${body.angularDamping}`);

        // Enable sleeping for better performance
        body.allowSleep = true;
        body.sleepSpeedLimit = 0.1;
        body.sleepTimeLimit = 1;

        return body;
    }

    private createPhysicsShapeForDiceType(diceType: string, size: number): CANNON.Shape {
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

    private getNextDicePosition(): THREE.Vector3 {
        const gridSize = 2.5; // Space between dice
        const cols = 8; // Dice per row
        const totalDice = this.diceArray.length;

        const col = totalDice % cols;
        const row = Math.floor(totalDice / cols);

        return new THREE.Vector3(
            (col - cols / 2) * gridSize,
            this.floorHeight + 2, // Start above floor
            (row - 2) * gridSize
        );
    }


    clearAllDice(): void {
        // Remove all dice from scene
        for (const mesh of this.diceArray) {
            this.scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
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

    removeSingleDice(diceType: string): boolean {
        // Find the last dice of the specified type
        for (let i = this.diceTypeArray.length - 1; i >= 0; i--) {
            if (this.diceTypeArray[i] === diceType) {
                // Remove from scene
                const mesh = this.diceArray[i];
                this.scene.remove(mesh);
                if (mesh.geometry) mesh.geometry.dispose();
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
                } else if (this.draggedDiceIndex > i) {
                    this.draggedDiceIndex--;
                }

                return true; // Successfully removed
            }
        }
        return false; // No dice of this type found
    }

    private getRandomResultForDiceType(diceType: string): number {
        const faceCount = this.getFaceCountForDiceType(diceType);
        return Math.floor(Math.random() * faceCount) + 1;
    }

    private checkSingleDiceSettling(diceIndex: number): void {
        if (!this.isViewActive || !this.isRolling || diceIndex < 0 || diceIndex >= this.diceBodyArray.length) return;

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
        } else {
            // Check again in 100ms
            setTimeout(() => this.checkSingleDiceSettling(diceIndex), 100);
        }
    }

    private completeSingleDiceRoll(diceIndex: number): void {
        if (this.rollTimeout) {
            clearTimeout(this.rollTimeout);
            this.rollTimeout = null;
        }

        const diceType = this.diceTypeArray[diceIndex];

        // Wait 2 seconds before checking result to match multi-dice behavior
        setTimeout(() => {
            // Check if dice can be properly detected
            const checkResult = this.checkDiceResult(diceIndex);

            let formattedResult: string;

            if (checkResult.isCaught) {
                // Dice is caught - highlight it and show in result
                this.highlightCaughtDice(diceIndex, true);
                formattedResult = `1${diceType}(CAUGHT) = CAUGHT - Face confidence: ${checkResult.confidence.toFixed(3)}, required: ${checkResult.requiredConfidence.toFixed(3)}`;
                console.log(`🥅 Single dice ${diceIndex} (${diceType}) CAUGHT! Face confidence: ${checkResult.confidence.toFixed(3)}, required: ${checkResult.requiredConfidence.toFixed(3)}`);
            } else {
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

    private checkMultiDiceSettling(): void {
        if (!this.isViewActive || !this.isRolling) return;

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
        } else {
            // Check again in 100ms
            setTimeout(() => this.checkMultiDiceSettling(), 100);
        }
    }

    private completeMultiRoll(): void {
        // Clear timeout if it exists
        if (this.rollTimeoutId) {
            clearTimeout(this.rollTimeoutId);
            this.rollTimeoutId = null;
        }

        console.log('✅ All dice settled - calculating results');

        // Calculate results for all dice using physics-based face detection
        const results: { [key: string]: number[] } = {};
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

    private forceStopMultiRoll(): void {
        console.log('⏰ Force stopping multi-dice roll due to timeout');
        this.completeMultiRoll();
    }

    // Check if dice can be determined, or if it's caught
    private checkDiceResult(diceIndex: number): { isCaught: boolean; result: number | null; confidence: number; requiredConfidence: number } {
        const diceType = this.diceTypeArray[diceIndex];
        const diceMesh = this.diceArray[diceIndex];

        if (!diceMesh) {
            return { isCaught: false, result: this.getRandomResultForDiceType(diceType), confidence: 0, requiredConfidence: 0 };
        }

        // Get face normals for this dice type
        const faceNormals = this.getFaceNormalsForDiceType(diceType);

        // Detection vector based on dice type
        const detectionVector = diceType === 'd4'
            ? new THREE.Vector3(0, -1, 0)  // Down vector for D4
            : new THREE.Vector3(0, 1, 0);   // Up vector for others

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
        } else {
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

    private getTopFaceNumberForDice(diceIndex: number): number {
        // Use the unified checkDiceResult method to perform face detection
        const checkResult = this.checkDiceResult(diceIndex);

        // Just return the result (or fallback if caught)
        // Note: Caught checking/highlighting is handled separately in monitoring code
        if (checkResult.isCaught) {
            return this.getRandomResultForDiceType(this.diceTypeArray[diceIndex]);
        }

        return checkResult.result!;
    }

    private getFaceNormalsForDiceType(diceType: string): THREE.Vector3[] {
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
                if (n0.dot(face0Center.clone().sub(center)) < 0) n0.negate();

                // Face 1: vertices 0, 3, 1
                const face1Center = new THREE.Vector3().addVectors(v0, v3).add(v1).divideScalar(3);
                const e1_1 = new THREE.Vector3().subVectors(v3, v0);
                const e1_2 = new THREE.Vector3().subVectors(v1, v0);
                let n1 = new THREE.Vector3().crossVectors(e1_1, e1_2).normalize();
                if (n1.dot(face1Center.clone().sub(center)) < 0) n1.negate();

                // Face 2: vertices 1, 3, 2
                const face2Center = new THREE.Vector3().addVectors(v1, v3).add(v2).divideScalar(3);
                const e2_1 = new THREE.Vector3().subVectors(v3, v1);
                const e2_2 = new THREE.Vector3().subVectors(v2, v1);
                let n2 = new THREE.Vector3().crossVectors(e2_1, e2_2).normalize();
                if (n2.dot(face2Center.clone().sub(center)) < 0) n2.negate();

                // Face 3: vertices 2, 0, 1
                const face3Center = new THREE.Vector3().addVectors(v2, v0).add(v1).divideScalar(3);
                const e3_1 = new THREE.Vector3().subVectors(v0, v2);
                const e3_2 = new THREE.Vector3().subVectors(v1, v2);
                let n3 = new THREE.Vector3().crossVectors(e3_1, e3_2).normalize();
                if (n3.dot(face3Center.clone().sub(center)) < 0) n3.negate();

                console.log('D4 Face normals calculated:');
                console.log(`  Face 0 (value 1): (${n0.x.toFixed(3)}, ${n0.y.toFixed(3)}, ${n0.z.toFixed(3)})`);
                console.log(`  Face 1 (value 2): (${n1.x.toFixed(3)}, ${n1.y.toFixed(3)}, ${n1.z.toFixed(3)})`);
                console.log(`  Face 2 (value 3): (${n2.x.toFixed(3)}, ${n2.y.toFixed(3)}, ${n2.z.toFixed(3)})`);
                console.log(`  Face 3 (value 4): (${n3.x.toFixed(3)}, ${n3.y.toFixed(3)}, ${n3.z.toFixed(3)})`);

                return [n0, n1, n2, n3];

            case 'd6':
                // Box/Cube face normals
                return [
                    new THREE.Vector3(1, 0, 0),   // Right
                    new THREE.Vector3(-1, 0, 0),  // Left
                    new THREE.Vector3(0, 1, 0),   // Top
                    new THREE.Vector3(0, -1, 0),  // Bottom
                    new THREE.Vector3(0, 0, 1),   // Front
                    new THREE.Vector3(0, 0, -1)   // Back
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
                const normals: THREE.Vector3[] = [];
                for (let i = 0; i < 10; i++) {
                    const angle = (i * 2 * Math.PI / 10);
                    const normal = new THREE.Vector3(
                        Math.cos(angle),
                        0.3, // Slight upward angle
                        Math.sin(angle)
                    ).normalize();
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

    private mapFaceIndexToNumber(faceIndex: number, diceType: string): number {
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

    private formatRollResults(results: { [key: string]: number[] }, totalSum: number): string {
        const resultParts: string[] = [];

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

    private animateAllDice(): void {
        // Simple animation - just spin all dice
        for (let i = 0; i < this.diceArray.length; i++) {
            const dice = this.diceArray[i];
            const body = this.diceBodyArray[i];

            // Add random rotation
            dice.rotation.x += (Math.random() - 0.5) * 2;
            dice.rotation.y += (Math.random() - 0.5) * 2;
            dice.rotation.z += (Math.random() - 0.5) * 2;

            // Add small physics impulse for visual effect
            body.velocity.set(
                (Math.random() - 0.5) * 2,
                Math.random() * 2,
                (Math.random() - 0.5) * 2
            );
        }
    }

    // ============================================================================

    private createPhysicsBody(): void {
        // DISABLED: Legacy single-dice physics body creation
        // Multi-dice system uses createPhysicsBodyForDiceType() instead
        console.log('createPhysicsBody() called but disabled for multi-dice system');
        return;
    }

    private createConvexPolyhedronFromGeometry(geometry: THREE.BufferGeometry): CANNON.ConvexPolyhedron {
        const workingGeometry = geometry.toNonIndexed();
        const positionAttribute = workingGeometry.attributes.position;

        if (!positionAttribute) {
            workingGeometry.dispose();
            throw new Error('Cannot create convex polyhedron: missing position attribute');
        }

        const vertices: CANNON.Vec3[] = [];
        const faces: number[][] = [];
        const vertexMap = new Map<string, number>();

        const addVertex = (vertex: THREE.Vector3): number => {
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
            const face: number[] = [];
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

    private initializeFaceNumbers() {
        // Initialize face numbers based on dice type
        const faceCount = this.getFaceCount();
        this.faceNumbers = [];

        for (let i = 0; i < faceCount; i++) {
            this.faceNumbers.push(i + 1);
        }

        console.log(`Initialized ${faceCount} face numbers for ${this.settings.diceType}:`, this.faceNumbers);
    }

    private calculateFaceNormals() {
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

    private calculateBoxFaceNormals() {
        // Box has 6 faces with specific normals
        this.faceNormals = [
            new THREE.Vector3(1, 0, 0),   // Right face
            new THREE.Vector3(-1, 0, 0),  // Left face
            new THREE.Vector3(0, 1, 0),   // Top face
            new THREE.Vector3(0, -1, 0),  // Bottom face
            new THREE.Vector3(0, 0, 1),   // Front face
            new THREE.Vector3(0, 0, -1)   // Back face
        ];
    }

    private calculateCylinderFaceNormals() {
        // For d10, create normals for 10 faces around the cylinder
        this.faceNormals = [];
        const faceCount = this.getFaceCount();

        for (let i = 0; i < faceCount; i++) {
            const angle = (i * 2 * Math.PI / faceCount);
            const normal = new THREE.Vector3(
                Math.cos(angle),
                0.3, // Slight upward angle for d10 shape
                Math.sin(angle)
            ).normalize();
            this.faceNormals.push(normal);
        }
    }

    private calculateDodecahedronFaceNormals() {
        // For D12, calculate the normals of the 12 actual pentagonal faces
        // Based on the physics body face definitions
        const phi = (1 + Math.sqrt(5)) / 2;
        const invPhi = 1 / phi;

        // Define the 12 pentagon face normals for a dodecahedron
        this.faceNormals = [
            new THREE.Vector3(0, phi, invPhi).normalize(),     // Face 1
            new THREE.Vector3(invPhi, phi, 0).normalize(),     // Face 2
            new THREE.Vector3(invPhi, 0, phi).normalize(),     // Face 3
            new THREE.Vector3(-invPhi, 0, phi).normalize(),    // Face 4
            new THREE.Vector3(-invPhi, phi, 0).normalize(),    // Face 5
            new THREE.Vector3(0, invPhi, phi).normalize(),     // Face 6
            new THREE.Vector3(0, phi, -invPhi).normalize(),    // Face 7
            new THREE.Vector3(invPhi, 0, -phi).normalize(),    // Face 8
            new THREE.Vector3(0, -invPhi, -phi).normalize(),   // Face 9
            new THREE.Vector3(0, -phi, -invPhi).normalize(),   // Face 10
            new THREE.Vector3(-invPhi, 0, -phi).normalize(),   // Face 11
            new THREE.Vector3(0, -phi, invPhi).normalize()     // Face 12
        ];
    }
    private calculateD10FaceNormals(): void {
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

    private calculateTrapezohedronFaceNormals(): void {
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


    private addDiceTextures() {
        if (!this.dice) return;

        // Try to load custom texture for current dice type
        const textureData = this.getCurrentDiceTextureData();
        let customTexture: THREE.Texture | null = null;

        if (textureData) {
            customTexture = this.loadCustomTexture(textureData);
        }

        // Try to load normal map for current dice type
        const normalMapData = this.getCurrentDiceNormalMapData();
        let normalMap: THREE.Texture | null = null;

        if (normalMapData) {
            normalMap = this.loadNormalMap(normalMapData);
        }

        // Create material with all configurable properties
        const materialProperties: any = {
            color: this.settings.diceColor, // Always apply dice color (acts as tint with textures)
            shininess: this.settings.diceShininess,
            specular: this.settings.diceSpecular,
            transparent: this.settings.diceTransparent,
            opacity: this.settings.diceOpacity
        };

        // Add texture if available
        if (customTexture) {
            materialProperties.map = customTexture;
            console.log(`Applied custom texture to ${this.settings.diceType} with color tint ${this.settings.diceColor}`);
        } else {
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
    public generateUVTemplate(): string {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        canvas.width = 512;
        canvas.height = 512;

        // D20 face colors and corresponding numbers
        const faceData = [
            { color: '#FF0000', number: 1 },   // Red
            { color: '#00FF00', number: 2 },   // Green
            { color: '#0000FF', number: 3 },   // Blue
            { color: '#FFFF00', number: 4 },   // Yellow
            { color: '#FF00FF', number: 5 },   // Magenta
            { color: '#00FFFF', number: 6 },   // Cyan
            { color: '#FFA500', number: 7 },   // Orange
            { color: '#800080', number: 8 },   // Purple
            { color: '#FFC0CB', number: 9 },   // Pink
            { color: '#A52A2A', number: 10 },  // Brown
            { color: '#808080', number: 11 },  // Gray
            { color: '#000000', number: 12 },  // Black
            { color: '#FFFFFF', number: 13 },  // White
            { color: '#90EE90', number: 14 },  // Light Green
            { color: '#FFB6C1', number: 15 },  // Light Pink
            { color: '#87CEEB', number: 16 },  // Sky Blue
            { color: '#DDA0DD', number: 17 },  // Plum
            { color: '#F0E68C', number: 18 },  // Khaki
            { color: '#20B2AA', number: 19 },  // Light Sea Green
            { color: '#DC143C', number: 20 }   // Crimson
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
            ctx.fillText(faceData[i].number.toString(), x + cellWidth/2, y + cellHeight/2);

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
    public logColorMapping(): void {
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

    private getCurrentDiceTextureData(): string | null {
        const textureMap = this.settings.diceTextures as Record<string, string> | undefined;
        if (textureMap) {
            const perType = textureMap[this.settings.diceType];
            if (perType && perType.trim() !== '') {
                return perType;
            }
        }

        return null;
    }

    private getFaceCount(): number {
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

    private loadCustomTexture(textureData?: string): THREE.Texture | null {
        if (!textureData) return null;

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
        } catch (error) {
            console.error('Failed to load custom dice texture:', error);
            return null;
        }
    }

    private getCurrentDiceNormalMapData(): string | null {
        // Check for per-dice-type normal map
        const diceType = this.settings.diceType;
        const normalMapData = this.settings.diceNormalMaps[diceType];

        if (normalMapData && normalMapData.trim() !== '') {
            return normalMapData;
        }

        return null;
    }

    private loadNormalMap(normalMapData?: string): THREE.Texture | null {
        if (!normalMapData) return null;

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
        } catch (error) {
            console.error('Failed to load normal map:', error);
            return null;
        }
    }


    private setupLighting() {
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
        this.ambientLight = new THREE.AmbientLight(
            new THREE.Color(this.settings.ambientLightColor),
            this.settings.ambientLightIntensity
        );
        this.scene.add(this.ambientLight);

        // Directional light with configurable properties
        this.directionalLight = new THREE.DirectionalLight(
            new THREE.Color(this.settings.directionalLightColor),
            this.settings.directionalLightIntensity
        );

        // Set configurable position
        this.directionalLight.position.set(
            this.settings.directionalLightPositionX,
            this.settings.directionalLightPositionY,
            this.settings.directionalLightPositionZ
        );

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

    private setupDragControls() {
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

    private updateMousePosition(clientX: number, clientY: number) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }

    private onMouseDown(event: MouseEvent) {
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

    private onTouchStart(event: TouchEvent) {
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
            } else {
                event.preventDefault();
            }
        }
    }

    private onMouseMove(event: MouseEvent) {
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
            } else {
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

    private onMouseEnter(event: MouseEvent) {
        this.updateMousePosition(event.clientX, event.clientY);
        if (!this.isRolling && !this.isDragging && this.diceArray.length > 0) {
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.diceArray, true);
            this.isHoveringDice = intersects.length > 0;
        }
    }

    private onMouseLeave(event: MouseEvent) {
        if (!this.isDragging) {
            this.isHoveringDice = false;
            this.renderer.domElement.style.cursor = 'default';
        }
    }






    private onTouchMove(event: TouchEvent) {
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

    private onMouseUp(event: MouseEvent) {
        if (this.isDragging) {
            this.throwDice(event.clientX, event.clientY);
        }
    }

    private onTouchEnd(event: TouchEvent) {
        if (this.isDragging) {
            const touch = event.changedTouches[0];
            this.throwDice(touch.clientX, touch.clientY);
        }
    }

    private checkDiceClick(event: MouseEvent) {
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

            if (clickedDiceIndex === -1) return false;

            // Only prevent event propagation when actually clicking on dice
            event.stopPropagation();
            event.preventDefault();

            // Handle different interaction modes
            if (event.ctrlKey && event.altKey) {
                // Ctrl+Alt+Click: Delete dice
                this.deleteDiceAtIndex(clickedDiceIndex);
                return true;
            } else if (event.ctrlKey) {
                // Ctrl+Click: Select/drag all dice
                this.startDragAllDice();
                return true;
            } else {
                // Regular click: Select/drag individual dice
                this.startDragSingleDice(clickedDiceIndex);
                return true;
            }
        }

        return false; // Indicate that no dice was clicked
    }

    private deleteDiceAtIndex(index: number): void {
        if (index < 0 || index >= this.diceArray.length) return;

        const diceType = this.diceTypeArray[index];

        // Remove from scene and physics
        this.scene.remove(this.diceArray[index]);
        this.world.removeBody(this.diceBodyArray[index]);

        // Dispose geometry and material
        this.diceArray[index].geometry.dispose();
        if (this.diceArray[index].material && !Array.isArray(this.diceArray[index].material)) {
            (this.diceArray[index].material as THREE.Material).dispose();
        }

        // Remove from arrays
        this.diceArray.splice(index, 1);
        this.diceBodyArray.splice(index, 1);
        this.diceTypeArray.splice(index, 1);

        // Update dice count in settings
        (this.settings.diceCounts as any)[diceType]--;

        console.log(`Deleted ${diceType} dice. Remaining: ${this.diceArray.length}`);
    }

    private startDragSingleDice(index: number): void {
        this.isDragging = true;
        this.draggedDiceIndex = index;
        this.renderer.domElement.style.cursor = 'grabbing';

        // Clear highlight if this dice is highlighted (completed)
        if (this.originalMaterials.has(index)) {
            console.log(`🔄 Clearing highlight from dice ${index} - starting drag`);
            this.highlightCaughtDice(index, false);
        }

        // Reset state if it exists (during active monitoring)
        const state = this.diceStates[index];
        if (state) {
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

    private startDragAllDice(): void {
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

            // Clear highlight if this dice is highlighted (completed)
            if (this.originalMaterials.has(i)) {
                console.log(`🔄 Clearing highlight from dice ${i} - starting drag all`);
                this.highlightCaughtDice(i, false);
            }

            // Reset state if it exists (during active monitoring)
            const state = this.diceStates[i];
            if (state) {
                state.isCaught = false;
                state.isComplete = false;
                state.result = null;
                state.stableTime = 0;
                state.isRolling = true;
                state.lastMotion = Date.now();
            }

            body.position.set(
                Math.cos(angle) * spread,
                2,
                Math.sin(angle) * spread
            );
            body.velocity.set(0, 0, 0);
            body.angularVelocity.set(0, 0, 0);
        }
    }

    private updateDicePosition() {
        if (!this.isDragging) return;

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
        } else if (this.draggedDiceIndex >= 0 && this.draggedDiceIndex < this.diceBodyArray.length) {
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

    private throwDice(endX: number, endY: number) {
        this.isDragging = false;
        this.renderer.domElement.style.cursor = 'default';

        this.isRolling = true;

        // Track which dice we're rolling (single or all)
        const rollingSingleDice = this.draggedDiceIndex >= 0;

        // Use mouse velocity for realistic momentum-based throwing
        const velocityMultiplier = 50;
        const baseThrowForce = new CANNON.Vec3(
            this.mouseVelocity.x * velocityMultiplier,
            -Math.max(Math.abs(this.mouseVelocity.x + this.mouseVelocity.y) * velocityMultiplier * 0.5, 3),
            this.mouseVelocity.y * velocityMultiplier
        );

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
                body.angularVelocity.set(
                    (Math.random() - 0.5) * spinIntensity + this.mouseVelocity.y * 10,
                    (Math.random() - 0.5) * spinIntensity,
                    (Math.random() - 0.5) * spinIntensity + this.mouseVelocity.x * 10
                );
            }
        } else if (this.draggedDiceIndex >= 0 && this.draggedDiceIndex < this.diceBodyArray.length) {
            // Throw single dice
            const body = this.diceBodyArray[this.draggedDiceIndex];
            body.velocity.copy(baseThrowForce);

            // Apply spin based on velocity direction and magnitude
            const spinIntensity = Math.min(Math.sqrt(this.mouseVelocity.x * this.mouseVelocity.x + this.mouseVelocity.y * this.mouseVelocity.y) * 100, 25);
            body.angularVelocity.set(
                (Math.random() - 0.5) * spinIntensity + this.mouseVelocity.y * 10,
                (Math.random() - 0.5) * spinIntensity,
                (Math.random() - 0.5) * spinIntensity + this.mouseVelocity.x * 10
            );
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
            } else {
                // True single dice roll - check only that dice
                this.checkSingleDiceSettling(rolledDiceIndex);
            }
        } else {
            // Multiple dice - use enhanced monitoring with catching detection
            this.initializeDiceStates();
            // Note: Forces already applied above, just start monitoring
            this.startIndividualDiceMonitoring(
                (result) => {
                    // On completion, trigger callback
                    if (this.onRollComplete) {
                        this.onRollComplete(result);
                    }
                    this.isRolling = false;
                },
                (error) => {
                    console.error('Throw monitoring error:', error);
                    this.isRolling = false;
                }
            );
        }

        // Set timeout for force stop
        const baseTimeout = 6000;
        const extendedTimeout = baseTimeout + (this.settings.motionThreshold * 1000);
        console.log(`🕐 Throw timeout set to ${extendedTimeout}ms`);

        this.rollTimeout = setTimeout(() => {
            if (rollingSingleDice) {
                this.completeSingleDiceRoll(rolledDiceIndex);
            } else {
                this.forceStopMultiRoll();
            }
        }, extendedTimeout);
    }

    private forceStop() {
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

    private animate() {
        // Stop animation loop if view is no longer active
        if (!this.isViewActive) {
            console.log('🛑 Animation loop stopped - view is no longer active');
            if (this.animationId !== null) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
            return;
        }

        this.animationId = requestAnimationFrame(() => this.animate());

        // Step physics simulation with fixed timestep for consistency
        this.world.step(1/60);

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
                    dice.position.copy(body.position as any);
                    dice.quaternion.copy(body.quaternion as any);
                }
            }
        }

        // Note: Hover circle functionality disabled for multi-dice system

        // Note: Rolling detection simplified for multi-dice system
        // Individual dice rolling logic will be implemented in future phases

        this.renderer.render(this.scene, this.camera);
    }


    // Old roll method removed - replaced by enhanced roll method with individual dice tracking

    private rollResolve: ((value: number) => void) | null = null;
    private multiRollResolve: ((value: string) => void) | null = null;
    private rollTimeoutId: NodeJS.Timeout | null = null;
    private showingResult = false;

    private calculateResult(): void {
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



    private calculateRotationForTopFace(targetFaceNumber: number): THREE.Euler {
        // Use the accurate Euler rotations captured for each face
        const faceRotations: { [key: number]: THREE.Euler } = {
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
        } else {
            console.warn(`No calibrated rotation found for face ${targetFaceNumber}, using default`);
            return new THREE.Euler(0, 0, 0);
        }
    }

    public debugPhysics(): void {
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
        const physicsEuler = new THREE.Euler().setFromQuaternion(
            new THREE.Quaternion(physicsQuat.x, physicsQuat.y, physicsQuat.z, physicsQuat.w)
        );
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

    private debugFaceDetectionDistances(): void {
        const currentRotation = this.dice.rotation;

        const faceRotations: { [key: number]: THREE.Euler } = {
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

        const distances: Array<{face: number, distance: number}> = [];

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

    private calculateRotationToShowFace(faceNormal: THREE.Vector3): THREE.Euler {
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

    private getTopFaceNumber(): number {
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
                ? new THREE.Vector3(0, -1, 0)  // Down vector for D4
                : new THREE.Vector3(0, 1, 0);  // Up vector for other dice

            // Detection tolerance - dot product must be within this range of 1.0 for "up"
            const tolerance = this.settings.faceDetectionTolerance;
            const minDotProduct = 1.0 - tolerance;

            let bestFace = 1;
            let bestDotProduct = -1;

            const detectionResults: Array<{face: number, dotProduct: number, worldNormal: THREE.Vector3}> = [];

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
                    const d10Mapping: { [key: number]: number } = {
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
        } catch (error) {
            console.error('Error in face normal detection:', error);
            const faceCount = this.getFaceCount();
            return Math.floor(Math.random() * faceCount) + 1;
        }
    }

    private snapDiceToFace(faceNumber: number, targetPosition?: THREE.Vector3): void {
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

    private getLowestVertexYForQuaternion(quaternion: THREE.Quaternion): number {
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

    private snapToNearestFace(): void {
        const nearestFace = this.getTopFaceNumber();

        // All snap behavior removed - dice settle naturally

        const faceRotations: { [key: number]: THREE.Euler } = {
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

    private normalizeAngle(angle: number): number {
        // Normalize angle to [-π, π]
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }


    private setInitialSize() {
        // Get the full window size minus ribbon
        const containerWidth = window.innerWidth;
        const containerHeight = window.innerHeight - 44; // 44px for ribbon
        this.updateSize(containerWidth, containerHeight);
    }

    public updateSize(width: number, height: number) {
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

    private reinitializeAfterContextLoss() {
        try {
            // Recreate the scene elements
            this.createDiceTray();
            this.setupLighting();
            console.log('Scene reinitialized after WebGL context restore');
        } catch (error) {
            console.error('Failed to reinitialize scene after context loss:', error);
        }
    }

    private createWindowBorder() {
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

    private removeWindowBorder() {
        if (this.windowBorder) {
            this.container.removeChild(this.windowBorder);
            this.windowBorder = null;
        }
    }

    public updateSettings(newSettings: DiceSettings) {
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
            const material = this.dice.material as THREE.MeshPhongMaterial;
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

    public destroy() {
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
                gl.getExtension('WEBGL_lose_context')!.loseContext();
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

    public autoCalibrateFace(faceNumber: number): boolean {
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

    // Callback for when calibration changes
    public onCalibrationChanged: (() => void) | null = null;

    public setClickthroughMode(enabled: boolean) {
        this.forceClickthroughMode = enabled;
        const canvas = this.renderer.domElement;

        if (enabled) {
            // Enable clickthrough - make canvas non-interactive
            canvas.style.pointerEvents = 'none';
            canvas.style.cursor = 'default';
        } else {
            // Disable clickthrough - make canvas interactive
            canvas.style.pointerEvents = 'auto';
            if (this.isHoveringDice) {
                canvas.style.cursor = 'grab';
            } else {
                canvas.style.cursor = 'default';
            }
        }
    }

    // Individual dice states for enhanced roll system
    private diceStates: Array<{
        index: number;
        type: string;
        isRolling: boolean;
        isCaught: boolean;
        isComplete: boolean;
        result: number | null;
        lastMotion: number;
        stableTime: number;
    }> = [];
    private currentMonitor: (() => void) | null = null;
    private originalMaterials: Map<number, THREE.Material | THREE.Material[]> = new Map();

    // Enhanced roll method with individual dice detection
    public async roll(): Promise<string> {
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

            } catch (error) {
                console.error('Roll error:', error);
                reject(error);
            }
        });
    }

    private initializeDiceStates() {
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

    private applyRollForces() {
        this.diceBodyArray.forEach((body, index) => {
            if (body) {
                // Reset position to prevent stacking
                const spread = Math.min(this.diceArray.length * 0.3, 4);
                const angle = (index / this.diceArray.length) * Math.PI * 2;
                const radius = spread * 0.5;

                body.position.set(
                    Math.cos(angle) * radius,
                    5 + Math.random() * 2,
                    Math.sin(angle) * radius
                );

                // Apply random rotation
                body.quaternion.set(
                    Math.random() - 0.5,
                    Math.random() - 0.5,
                    Math.random() - 0.5,
                    Math.random() - 0.5
                );
                body.quaternion.normalize();

                // Apply strong impulse force
                const forceMultiplier = 15 + Math.random() * 10;
                const force = new CANNON.Vec3(
                    (Math.random() - 0.5) * forceMultiplier,
                    Math.random() * 5,
                    (Math.random() - 0.5) * forceMultiplier
                );
                body.applyImpulse(force);

                // Apply random torque
                const torque = new CANNON.Vec3(
                    (Math.random() - 0.5) * 20,
                    (Math.random() - 0.5) * 20,
                    (Math.random() - 0.5) * 20
                );
                body.applyTorque(torque);

                console.log(`🎲 Applied force to dice ${index}: force=${force.length().toFixed(2)}, torque=${torque.length().toFixed(2)}`);
            }
        });
    }

    private startIndividualDiceMonitoring(resolve: (value: string) => void, reject: (reason?: any) => void) {
        const startTime = Date.now();
        const maxWaitTime = 15000; // Maximum 15 seconds
        const checkInterval = 100; // Check every 100ms

        const monitor = () => {
            try {
                // Early exit if view is no longer active
                if (!this.isViewActive) {
                    console.log('🛑 Monitoring stopped - view is no longer active');
                    this.currentMonitor = null;
                    this.diceStates = [];
                    return;
                }

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
                            } else if (now - state.stableTime > 2000 && !state.isComplete) {
                                // Dice has been stable for 2 seconds - check if it can be determined
                                // Re-check every 500ms for caught dice in case they micro-settle
                                const shouldCheck = !state.isCaught || (now - state.lastMotion > 500);

                                if (shouldCheck) {
                                    const checkResult = this.checkDiceResult(i);

                                    if (checkResult.isCaught) {
                                        if (!state.isCaught) {
                                            // First time catching this dice - no highlight for caught state
                                            state.isCaught = true;
                                            state.isRolling = false;
                                            state.result = null;
                                            console.log(`🥅 Dice ${i} (${state.type}) CAUGHT! Face confidence: ${checkResult.confidence.toFixed(3)}, required: ${checkResult.requiredConfidence.toFixed(3)}`);
                                        }
                                        // Update lastMotion to prevent rapid re-checking
                                        state.lastMotion = now;
                                    } else {
                                        // Face detection succeeded - HIGHLIGHT the completed dice
                                        if (state.isCaught) {
                                            // Was caught but now valid - clear caught state and highlight as complete
                                            console.log(`✅ Dice ${i} (${state.type}) was caught but has now settled with result: ${checkResult.result}`);
                                        } else {
                                            console.log(`✅ Dice ${i} (${state.type}) settled with result: ${checkResult.result}`);
                                        }
                                        state.result = checkResult.result;
                                        state.isComplete = true;
                                        state.isRolling = false;
                                        state.isCaught = false;
                                        // Highlight completed dice
                                        this.highlightCaughtDice(i, true);
                                    }
                                }
                            }
                        } else {
                            // Dice is moving again - reset stability timer
                            state.stableTime = 0;
                            state.lastMotion = now;

                            // If dice was marked as caught but is moving again, give it another chance
                            if (state.isCaught) {
                                console.log(`🔄 Dice ${i} was caught but is moving again - clearing caught state`);
                                state.isCaught = false;
                                state.isRolling = true;
                            }

                            // If dice was completed but is moving again, remove highlight
                            if (state.isComplete) {
                                console.log(`🔄 Dice ${i} was complete but is moving again - clearing highlight`);
                                state.isComplete = false;
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
                    // Continue monitoring but don't resolve (only if view is still active)
                    if (this.isViewActive) {
                        setTimeout(monitor, checkInterval);
                    } else {
                        console.log('🛑 Monitoring stopped - view is no longer active');
                        this.currentMonitor = null;
                        this.diceStates = [];
                    }
                    return;
                }

                // Check if all dice are complete (and none are caught)
                if (allComplete && caught === 0) {
                    // All dice have valid results - show final result
                    const results = this.diceStates.map(d => d.result).filter(r => r !== null);
                    const total = results.reduce((sum, val) => sum + val!, 0);

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
                    console.log(`⏰ Roll timeout after ${maxWaitTime/1000}s`);
                    // Force completion with current results
                    const partialResults = this.diceStates.map((state, i) => {
                        if (state.result !== null) {
                            return state.result;
                        } else {
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

                // Continue monitoring (only if view is still active)
                if (this.isViewActive) {
                    setTimeout(monitor, checkInterval);
                } else {
                    console.log('🛑 Monitoring stopped - view is no longer active');
                    this.currentMonitor = null;
                    this.diceStates = [];
                }

            } catch (error) {
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
    public rerollCaughtDice(): boolean {
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
                const force = new CANNON.Vec3(
                    (Math.random() - 0.5) * forceMultiplier,
                    -5, // Strong downward force to prevent recatching
                    (Math.random() - 0.5) * forceMultiplier
                );
                body.applyImpulse(force);

                console.log(`🔄 Rerolled dice ${state.index} with force ${force.length().toFixed(2)}`);
            }
        });

        return true;
    }

    // Get current dice status for UI updates
    public getDiceStatus(): Array<{index: number, type: string, status: string, result?: number}> {
        return this.diceStates.map(state => ({
            index: state.index,
            type: state.type,
            status: state.isComplete ? 'complete' :
                   state.isCaught ? 'caught' :
                   state.isRolling ? 'rolling' : 'unknown',
            result: state.result || undefined
        }));
    }

    // Highlight completed dice with emissive glow
    private highlightCaughtDice(index: number, highlight: boolean) {
        const dice = this.diceArray[index];
        if (!dice) return;

        if (highlight) {
            // Store original material if not already stored
            if (!this.originalMaterials.has(index)) {
                this.originalMaterials.set(index, dice.material);
            }

            // Create highlighted material with configured color
            const currentMaterial = Array.isArray(dice.material) ? dice.material[0] : dice.material;
            const highlightedMaterial = (currentMaterial as THREE.MeshStandardMaterial).clone();
            // Convert hex color string to number (e.g., "#00ff00" -> 0x00ff00)
            const colorHex = parseInt(this.settings.completedDiceHighlightColor.replace('#', ''), 16);
            highlightedMaterial.emissive.setHex(colorHex);
            highlightedMaterial.emissiveIntensity = 0.8;
            dice.material = highlightedMaterial;

            console.log(`🔆 Highlighted completed dice ${index}`);
        } else {
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
    private clearAllHighlights() {
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





