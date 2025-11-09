document.addEventListener('DOMContentLoaded', () => {

    const canvas = document.getElementById('graphCanvas');
    const ctx = canvas.getContext('2d');
    const themeToggle = document.getElementById('themeToggle');
    const modeToggle = document.getElementById('modeToggle');
    const modalOverlay = document.getElementById('custom-modal-overlay');
    const fixedEdgeInfo = document.getElementById('fixed-edge-info');

    let graph = { nodes: [], edges: [], mstEdges: [] };
    let nextNodeId = 0;
    let availableLabels = [];

    let state = {
        mode: 'generative',
        isRunning: false,
        isComplete: false,
        currentStep: 0,
        totalSteps: 0,
        steps: [],
        speed: 5,
        intervalId: null,
        consideringEdge: null,
        invalidEdges: [],
        priorityQueue: [],
        visitedNodes: new Set(),
        disjointSets: [],
        sortedEdges: null,
        draggingNode: null,
        dragOffset: { x: 0, y: 0 },
        potentialDragNode: null,
        mouseDownPos: { x: 0, y: 0},
        algorithmLocked: false,
        firstNodeForEdge: null,
        isDeletingNode: false,
        isEditingEdge: false,
        isDeletingEdge: false,
        hoveredNode: null,
        hoveredEdge: null,
        nodeToDelete: null,
        edgeToDelete: null,
        tooltipEdge: null,
        
        history: { generative: [], user: [] },
        historyIndex: { generative: -1, user: -1 },
        pendingEdge: null,
        pendingEdgeEdit: null
    };

    const PRIM_PSEUDOCODE = [
        { line: 'PRIM(Graph, startNode):', indent: 0 },
        { line: '  MST = empty set', indent: 1 },
        { line: '  visited = { startNode }', indent: 1 },
        { line: '  pq = edges from startNode', indent: 1 },
        { line: '  while visited nodes < total nodes:', indent: 1 },
        { line: '    edge = pq.extract_min()', indent: 2 },
        { line: '    if edge connects to unvisited node:', indent: 2 },
        { line: '      add edge to MST', indent: 3 },
        { line: '      new_node = unvisited node from edge', indent: 3 },
        { line: '      add new_node to visited set', indent: 3 },
        { line: '      add edges from new_node to pq', indent: 3 },
        { line: '    else:', indent: 2 },
        { line: '      discard edge (forms a cycle)', indent: 3 },
        { line: '  return MST', indent: 1 }
    ];

    const KRUSKAL_PSEUDOCODE = [
        { line: 'KRUSKAL(Graph):', indent: 0 },
        { line: '  MST = empty set', indent: 1 },
        { line: '  sort all edges by weight', indent: 1 },
        { line: '  for each node, create a new set', indent: 1 },
        { line: '  for each edge in sorted order:', indent: 1 },
        { line: '    if nodes of edge are in different sets:', indent: 2 },
        { line: '      add edge to MST', indent: 3 },
        { line: '      union the sets of the two nodes', indent: 3 },
        { line: '    else:', indent: 2 },
        { line: '      discard edge (forms a cycle)', indent: 3 },
        { line: '  return MST', indent: 1 }
    ];

    function initializeLabels() {
        availableLabels = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
    }
    
    const applyTheme = (theme) => {
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
            themeToggle.checked = true;
        } else {
            document.body.classList.remove('dark-mode');
            themeToggle.checked = false;
        }
        if (ctx) {
            drawGraph();
        }
    };

    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);

    themeToggle.addEventListener('change', () => {
        const newTheme = themeToggle.checked ? 'dark' : 'light';
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    });

    function switchMode(newMode) {
        state.mode = newMode;
        const genControls = document.getElementById('generative-mode-controls');
        const userControls = document.getElementById('user-mode-controls');
        const userInstructions = document.getElementById('user-mode-instructions');
        
        if (newMode === 'user') {
            genControls.classList.add('hidden');
            userControls.classList.remove('hidden');
            userInstructions.style.display = 'block';
            resetFull(); 
        } else {
            genControls.classList.remove('hidden');
            userControls.classList.add('hidden');
            userInstructions.style.display = 'none';
            generateGraph(); 
        }
        updateCanvasCursor();
        updateAnimationControls();
    }

    modeToggle.addEventListener('change', () => {
        switchMode(modeToggle.checked ? 'user' : 'generative');
    });

    setCanvasSize();
    window.addEventListener('resize', setCanvasSize);
    initializeEventListeners();
    initializeLabels();
    generateGraph();
    updateAlgorithmUI();

    const primBtn = document.getElementById('primBtn');
    if (primBtn && !primBtn.classList.contains('active')) {
        document.querySelectorAll('.algorithm-btn').forEach(btn => btn.classList.remove('active'));
        primBtn.classList.add('active');
        updateAlgorithmUI();
    }

    function updateEdgeDensityForGraphType() {
        const graphType = document.getElementById('graphTypeSelect').value;
        const edgeDensitySlider = document.getElementById('edgeDensity');
        const edgeDensityValue = document.getElementById('edgeDensityValue');
        const nodeCount = parseInt(document.getElementById('nodeCount').value);
        const startNodeSelect = document.getElementById('startNodeSelect');

        startNodeSelect.disabled = (graphType === 'cycle' || state.algorithmLocked);
        
        if (graphType === 'cycle') {
            let minDensity;
            if (nodeCount <= 5) minDensity = 70;
            else if (nodeCount == 6 ) minDensity = 60;
            else if (nodeCount <= 10) minDensity = 45;
            else if (nodeCount <= 15) minDensity = 30;
            else minDensity = 25;
            
            edgeDensitySlider.min = minDensity;
            
            edgeDensitySlider.value = minDensity;
            edgeDensityValue.textContent = minDensity + '%';
            edgeDensitySlider.dispatchEvent(new Event('input')); 
            edgeDensitySlider.disabled = false;
            
        } else if (graphType === 'complete') {
            edgeDensitySlider.disabled = true;
            edgeDensitySlider.value = 100;
            edgeDensityValue.textContent = '100%';
            edgeDensitySlider.dispatchEvent(new Event('input'));
        } else {
            edgeDensitySlider.min = 30;
            edgeDensitySlider.disabled = false;

            if (parseInt(edgeDensitySlider.value) < 30) {
                    edgeDensitySlider.value = 30;
                    edgeDensityValue.textContent = '30%';
                    edgeDensitySlider.dispatchEvent(new Event('input'));
            }
        }
    }

    // PRIM'S ALGO
    function primsAlgorithm() {
        const startNodeSelect = document.getElementById('startNodeSelect');
        let startNodeId = parseInt(startNodeSelect.value);
        if (graph.nodes.length === 0 || !graph.nodes.find(n => n.id === startNodeId)) {
            if (graph.nodes.length > 0) {
                startNodeId = graph.nodes[0].id;
                startNodeSelect.value = startNodeId;
                showToast("Invalid start node selected, defaulting to the first node.", 'error');
            } else {
                    showToast("Cannot start Prim's algorithm on an empty graph.", 'error');
                    return;
            }
        }

        const steps = [];
        const visited = new Set();
        const edges = [...graph.edges];
        
        visited.add(startNodeId);
        
        const priorityQueue = [];
        edges.forEach(edge => {
            if ((edge.from === startNodeId && !visited.has(edge.to)) || (edge.to === startNodeId && !visited.has(edge.from))) {
                priorityQueue.push({ edge, weight: edge.weight });
            }
        });
        priorityQueue.sort((a, b) => a.weight - b.weight);
        
        steps.push({
            description: `<div class="step-highlight">Starting Prim's from node ${graph.nodes.find(n=>n.id === startNodeId).label}</div><div class="step-explanation">The algorithm begins. Visited set is initialized with the start node, and all its adjacent edges are added to a Priority Queue.</div>`,
            priorityQueue: clone(priorityQueue),
            visitedNodes: [...visited],
            pseudoLine: 3,
        });
        
        while (visited.size < graph.nodes.length && priorityQueue.length > 0) {
            const minEdgeItem = priorityQueue.shift();
            const minEdge = minEdgeItem.edge;
            
            const fromNodeLabel = graph.nodes.find(n => n.id === minEdge.from)?.label || '?';
            const toNodeLabel = graph.nodes.find(n => n.id === minEdge.to)?.label || '?';

            steps.push({
                action: 'considerEdge', edge: minEdge,
                description: `<div class="step-highlight">Extracting minimum edge</div><div class="step-explanation">The edge with the lowest weight, <strong>${fromNodeLabel}-${toNodeLabel}</strong> (weight ${minEdge.weight}), is removed from the Priority Queue for consideration.</div>`,
                priorityQueue: clone(priorityQueue), visitedNodes: [...visited],
                pseudoLine: 5,
            });
            
            const fromVisited = visited.has(minEdge.from);
            const toVisited = visited.has(minEdge.to);
            
            if ((fromVisited && !toVisited) || (!fromVisited && toVisited)) {
                const newNodeId = fromVisited ? minEdge.to : minEdge.from;
                const newNode = graph.nodes.find(n => n.id === newNodeId);
                
                steps.push({
                    action: 'addEdge', edge: minEdge,
                    description: `<div class="step-highlight">✓ Edge added to MST</div><div class="step-explanation">This edge connects a visited node to an unvisited one (${newNode.label}). It's a safe edge to add to our Minimum Spanning Tree.</div>`,
                    priorityQueue: clone(priorityQueue), visitedNodes: [...visited],
                    pseudoLine: 7,
                });
                
                visited.add(newNodeId);
                
                edges.forEach(edge => {
                    const fromNew = (edge.from === newNodeId && !visited.has(edge.to));
                    const toNew = (edge.to === newNodeId && !visited.has(edge.from));
                    if (fromNew || toNew) {
                            priorityQueue.push({ edge, weight: edge.weight });
                    }
                });
                priorityQueue.sort((a, b) => a.weight - b.weight);
                
                steps.push({
                    description: `<div class="step-highlight">Updating Priority Queue</div><div class="step-explanation">Node ${newNode.label} is now visited. All its edges that lead to unvisited nodes are added to the Priority Queue.</div>`,
                    priorityQueue: clone(priorityQueue), visitedNodes: [...visited],
                    pseudoLine: 10,
                });
            } else {
                steps.push({
                    action: 'showInvalid', edge: minEdge, invalidEdges: [minEdge],
                    description: `<div class="step-highlight">❌ Edge discarded</div><div class="step-explanation">This edge connects two nodes that are already in the visited set. Adding it would create a cycle, so it is ignored.</div>`,
                    priorityQueue: clone(priorityQueue), visitedNodes: [...visited],
                    pseudoLine: 12,
                });
            }
        }
        steps.push({ description: `<div class="step-highlight">Algorithm Finished</div><div class="step-explanation">No more valid edges can be added. The Minimum Spanning Tree is complete.</div>`, priorityQueue: [], visitedNodes: [...visited], pseudoLine: 13, });
        state.steps = steps;
    }

    // KRUSKAL'S ALGO
    function kruskalsAlgorithm() {
        if (graph.nodes.length === 0) {
            showToast("Cannot run Kruskal's algorithm on an empty graph.", "error");
            return;
        }
        const steps = [];
        const edges = [...graph.edges];
        
        edges.sort((a, b) => a.weight - b.weight);
        state.sortedEdges = clone(edges);

        const nodeIds = graph.nodes.map(n => n.id);
        const parent = {};
        nodeIds.forEach(id => parent[id] = id);

        const find = u => (parent[u] === u ? u : (parent[u] = find(parent[u])));
        const union = (u, v) => {
            const rootU = find(u);
            const rootV = find(v);
            if (rootU !== rootV) {
                parent[rootV] = rootU;
                return true;
            }
            return false;
        };
        const getDisjointSets = () => {
            const sets = {};
            graph.nodes.forEach(node => {
                const root = find(node.id);
                if (!sets[root]) sets[root] = [];
                sets[root].push(node.id);
            });
            return Object.values(sets);
        };
        
        steps.push({
            description: `<div class="step-highlight">Starting Kruskal's algorithm</div><div class="step-explanation">First, all edges in the graph are sorted by weight in ascending order. Each node starts in its own disjoint set.</div>`,
            sortedEdges: clone(edges), disjointSets: getDisjointSets(),
            pseudoLine: 3,
        });
        
        let edgesAdded = 0;
        for (let i = 0; i < edges.length; i++) {
            if (edgesAdded >= graph.nodes.length - 1) break;
            const edge = edges[i];
            
            const fromNodeLabel = graph.nodes.find(n => n.id === edge.from)?.label || '?';
            const toNodeLabel = graph.nodes.find(n => n.id === edge.to)?.label || '?';

            steps.push({
                action: 'considerEdge', edge: edge,
                description: `<div class="step-highlight">Considering next edge</div><div class="step-explanation">The next edge in the sorted list, <strong>${fromNodeLabel}-${toNodeLabel}</strong> (weight ${edge.weight}), is considered.</div>`,
                sortedEdges: edges.slice(i + 1), disjointSets: getDisjointSets(),
                pseudoLine: 4,
            });
            
            if (find(edge.from) !== find(edge.to)) {
                union(edge.from, edge.to);
                edgesAdded++;
                steps.push({
                    action: 'addEdge', edge: edge,
                    description: `<div class="step-highlight">✓ Edge added to MST</div><div class="step-explanation">The nodes of this edge belong to different sets. Adding it will not form a cycle. It is added to the MST.</div>`,
                    sortedEdges: edges.slice(i + 1), disjointSets: getDisjointSets(),
                    pseudoLine: 6,
                });
                
                    steps.push({
                    description: `<div class="step-highlight">Union of sets</div><div class="step-explanation">The two disjoint sets connected by the new edge are now merged into a single set.</div>`,
                    sortedEdges: edges.slice(i+1), disjointSets: getDisjointSets(),
                    pseudoLine: 7,
                });
            } else {
                steps.push({
                    action: 'showInvalid', edge: edge, invalidEdges: [edge],
                    description: `<div class="step-highlight">❌ Edge discarded</div><div class="step-explanation">The nodes of this edge already belong to the same set. Adding this edge would form a cycle, so it is discarded.</div>`,
                    sortedEdges: edges.slice(i + 1), disjointSets: getDisjointSets(),
                    pseudoLine: 9,
                });
            }
        }
        steps.push({ description: `<div class="step-highlight">Algorithm Finished</div><div class="step-explanation">The Minimum Spanning Tree is complete, or all edges have been considered.</div>`, sortedEdges: [], disjointSets: getDisjointSets(), pseudoLine: 10, });
        state.steps = steps;
    }

    function startVisualization() {
        if (graph.nodes.length < 2) {
            showToast("Please create a graph with at least two nodes to visualize.", "warning");
            return;
        }
        resetAnimationState(false);
        
        const selectedAlgorithm = document.querySelector('.algorithm-btn.active').dataset.algo;
        if (selectedAlgorithm === 'prim') primsAlgorithm();
        else if (selectedAlgorithm === 'kruskal') kruskalsAlgorithm();
        
        if (state.steps.length > 0) {
            state.isRunning = true;
            state.totalSteps = state.steps.length;
            state.algorithmLocked = true;
            
            updateAnimationControls();
            state.intervalId = setInterval(animateStep, getAnimationDelay());
            showToast('Visualization started!', 'info');
        }
    }

    function animateStep() {
        if (state.currentStep < state.totalSteps) {
            executeStep(state.currentStep);
            state.currentStep++;
            updateAnimationControls();
        } else {
            clearInterval(state.intervalId);
            state.intervalId = null;
            state.isRunning = false;
            state.algorithmLocked = false;
            state.isComplete = true;
            
            const totalWeight = graph.mstEdges.reduce((sum, edge) => sum + edge.weight, 0);
            document.getElementById('algorithm-steps-panel').innerHTML = 
                `<div class="step-highlight">Algorithm complete!</div>
                    <div class="step-explanation">MST has ${graph.mstEdges.length} edges with total weight ${totalWeight}.</div>`;
            
            updateAnimationControls();
            drawGraph();
        }
    }

    function executeStep(stepIndex) {
        const step = state.steps[stepIndex];
        state.consideringEdge = null;
        state.invalidEdges = [];
        
        if (step.action === 'addEdge') {
            const edge = graph.edges.find(e => (e.from === step.edge.from && e.to === step.edge.to) || (e.from === step.edge.to && e.to === step.edge.from));
            if (edge) {
                edge.isInMST = true;
                if (!graph.mstEdges.includes(edge)) graph.mstEdges.push(edge);
            }
        } else if (step.action === 'considerEdge') {
            state.consideringEdge = step.edge;
        } else if (step.action === 'showInvalid') {
            state.invalidEdges = step.invalidEdges || [];
        }
        
        if (step.priorityQueue) state.priorityQueue = step.priorityQueue;
        if (step.visitedNodes) state.visitedNodes = new Set(step.visitedNodes);
        if (step.disjointSets) state.disjointSets = step.disjointSets;
        if (step.sortedEdges) state.sortedEdges = step.sortedEdges;
        
        document.getElementById('algorithm-steps-panel').innerHTML = step.description;
        highlightPseudoLine(step.pseudoLine);
        drawGraph();
    }

    // GRAPH GENERATION
    function countPrimSteps() {
        if (graph.nodes.length === 0) return 0;
        const startNodeId = graph.nodes[0].id;
        const steps = [];
        const visited = new Set();
        const edges = [...graph.edges];
        visited.add(startNodeId);
        const priorityQueue = [];
        edges.forEach(edge => {
            if ((edge.from === startNodeId && !visited.has(edge.to)) || (edge.to === startNodeId && !visited.has(edge.from))) {
                priorityQueue.push({ edge, weight: edge.weight });
            }
        });
        priorityQueue.sort((a, b) => a.weight - b.weight);
        steps.push({});
        while (visited.size < graph.nodes.length && priorityQueue.length > 0) {
            const minEdgeItem = priorityQueue.shift();
            const minEdge = minEdgeItem.edge;
            steps.push({});
            const fromVisited = visited.has(minEdge.from);
            const toVisited = visited.has(minEdge.to);
            if ((fromVisited && !toVisited) || (!fromVisited && toVisited)) {
                const newNode = fromVisited ? minEdge.to : minEdge.from;
                steps.push({});
                visited.add(newNode);
                edges.forEach(edge => {
                    const fromNew = (edge.from === newNode && !visited.has(edge.to));
                    const toNew = (edge.to === newNode && !visited.has(edge.from));
                    if (fromNew || toNew) {
                         priorityQueue.push({ edge, weight: edge.weight });
                    }
                });
                priorityQueue.sort((a, b) => a.weight - b.weight);
                steps.push({});
            } else {
                steps.push({});
            }
        }
        steps.push({});
        return steps.length;
    }

    function countKruskalSteps() {
        if (graph.nodes.length === 0) return 0;
        const steps = [];
        const edges = [...graph.edges];
        edges.sort((a, b) => a.weight - b.weight);
        const maxNodeId = graph.nodes.reduce((max, node) => Math.max(max, node.id), 0);
        const parent = Array.from({ length: maxNodeId + 1 }, (_, i) => i);
        const find = u => (parent[u] === u ? u : (parent[u] = find(parent[u])));
        const union = (u, v) => {
            const rootU = find(u);
            const rootV = find(v);
            if (rootU !== rootV) {
                parent[rootV] = rootU;
                return true;
            }
            return false;
        };
        steps.push({});
        let edgesAdded = 0;
        for (let i = 0; i < edges.length; i++) {
            if (edgesAdded >= graph.nodes.length - 1) break;
            const edge = edges[i];
            steps.push({});
            if (union(edge.from, edge.to)) {
                edgesAdded++;
                steps.push({});
                steps.push({});
            } else {
                steps.push({});
            }
        }
        steps.push({});
        return steps.length;
    }

    function generateGraph() {
        resetFull(true);
        const type = document.getElementById('graphTypeSelect').value;
        let nodeCount = parseInt(document.getElementById('nodeCount').value);
        
        const generateCycleGraphLogic = () => {
            graph.nodes = [];
            graph.edges = [];
            const current_nodeCount = parseInt(document.getElementById('nodeCount').value);
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;

            const radius = Math.min(canvas.width, canvas.height) * 0.4;
            
            for (let i = 0; i < current_nodeCount; i++) {
                const angle = (2 * Math.PI * i) / current_nodeCount;
                graph.nodes.push({ id: i, x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle), label: String.fromCharCode(65 + i) });
            }

            const addEdge = (u, v, weight) => {
                 if (u !== v && !graph.edges.some(e => (e.from === u && e.to === v) || (e.from === v && e.to === u))) {
                    graph.edges.push({ from: u, to: v, weight, isInMST: false });
                }
            };

            const edgeDensity = parseInt(document.getElementById('edgeDensity').value) / 100;
            const maxEdges = (current_nodeCount * (current_nodeCount - 1)) / 2;
            const targetEdgeCount = Math.floor(maxEdges * edgeDensity);

            for (let i = 0; i < current_nodeCount; i++) {
                const u = i;
                const v = (i + 1) % current_nodeCount;
                const weight = 15 + Math.floor(Math.random() * 10) + (i * 2);
                addEdge(u, v, weight);
            }

            const trapEdges = [];
            const baseTrapCount = current_nodeCount <= 7 ? Math.max(3, Math.floor(current_nodeCount * 0.8)) : Math.max(2, Math.floor(current_nodeCount / 3));
            const trapCount = Math.min(baseTrapCount, Math.floor((targetEdgeCount - current_nodeCount) * 0.7));
            
            for (let gap = 2; gap <= 3; gap++) {
                for (let i = 0; i < current_nodeCount && trapEdges.length < trapCount; i++) {
                    const j = (i + gap) % current_nodeCount;
                    if (i !== j && !graph.edges.some(e => 
                        (e.from === i && e.to === j) || (e.from === j && e.to === i))) {
                        trapEdges.push({ from: i, to: j });
                    }
                }
            }

            trapEdges.slice(0, trapCount).forEach(trap => {
                const weight = Math.floor(Math.random() * 5) + 1;
                addEdge(trap.from, trap.to, weight);
            });

            const remainingNeeded = targetEdgeCount - graph.edges.length;
            
            if (remainingNeeded > 0) {
                const allPossibleEdges = [];
                for (let i = 0; i < current_nodeCount; i++) {
                    for (let j = i + 1; j < current_nodeCount; j++) {
                        if (!graph.edges.some(e => 
                            (e.from === i && e.to === j) || (e.from === j && e.to === i))) {
                            allPossibleEdges.push({ from: i, to: j });
                        }
                    }
                }

                for (let i = allPossibleEdges.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [allPossibleEdges[i], allPossibleEdges[j]] = [allPossibleEdges[j], allPossibleEdges[i]];
                }

                for (let i = 0; i < Math.min(remainingNeeded, allPossibleEdges.length); i++) {
                    const edge = allPossibleEdges[i];
                    const weight = Math.floor(Math.random() * 30) + 20;
                    addEdge(edge.from, edge.to, weight);
                }
            }
        };

        if (type === 'cycle') {
            let attempts = 0;
            let primSteps, kruskalSteps;
            do {
                generateCycleGraphLogic();
                primSteps = countPrimSteps();
                kruskalSteps = countKruskalSteps();
                attempts++;
                if (attempts > 50) {
                    showToast("Could not generate a complex cycle graph. Using last attempt.", "warning");
                    break;
                }
            } while (primSteps < 16 || kruskalSteps < 16);

        } else {
            graph.nodes = [];
            graph.edges = [];
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;

            const radius = Math.min(canvas.width, canvas.height) * 0.4;
            
            for (let i = 0; i < nodeCount; i++) {
                const angle = (2 * Math.PI * i) / nodeCount;
                graph.nodes.push({ id: i, x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle), label: String.fromCharCode(65 + i) });
            }

            const addEdge = (u, v, weight) => {
                 if (u !== v && !graph.edges.some(e => (e.from === u && e.to === v) || (e.from === v && e.to === u))) {
                    graph.edges.push({ from: u, to: v, weight, isInMST: false });
                }
            };

            if (type === 'random') {
                const edgeDensity = parseInt(document.getElementById('edgeDensity').value) / 100;
                const parent = Array.from({ length: nodeCount }, (_, i) => i);
                const find = u => (parent[u] === u ? u : (parent[u] = find(parent[u])));
                const union = (u, v) => {
                    const rootU = find(u);
                    const rootV = find(v);
                    if (rootU !== rootV) {
                        parent[rootV] = rootU;
                        return true;
                    }
                    return false;
                };
                
                let sets = nodeCount;
                while (sets > 1) {
                    const u = Math.floor(Math.random() * nodeCount);
                    const v = Math.floor(Math.random() * nodeCount);
                    if (find(u) !== find(v)) {
                        addEdge(u, v, Math.floor(Math.random() * 20) + 1);
                        union(u, v);
                        sets--;
                    }
                }

                const maxEdges = nodeCount * (nodeCount - 1) / 2;
                const targetEdges = Math.floor(maxEdges * edgeDensity);
                while (graph.edges.length < targetEdges && graph.edges.length < maxEdges) {
                    const u = Math.floor(Math.random() * nodeCount);
                    const v = Math.floor(Math.random() * nodeCount);
                    addEdge(u, v, Math.floor(Math.random() * 20) + 1);
                }
            } else if (type === 'complete') {
                for (let i = 0; i < nodeCount; i++) {
                    for (let j = i + 1; j < nodeCount; j++) {
                        addEdge(i, j, Math.floor(Math.random() * 20) + 1);
                    }
                }
            }
        }
        
        nextNodeId = nodeCount;
        updateUIAfterGraphChange();
        showToast(`Generated a new '${type}' graph.`, 'success');
        
        saveState();
    }

    function setCanvasSize() {
        const container = canvas.parentElement;
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        drawGraph();
    }

    function calculateOptimalLabelPosition(edge, allEdges) {
        const fromNode = graph.nodes.find(n => n.id === edge.from);
        const toNode = graph.nodes.find(n => n.id === edge.to);
        if (!fromNode || !toNode) return { x: 0, y: 0 };

        const baseX = (fromNode.x + toNode.x) / 2;
        const baseY = (fromNode.y + toNode.y) / 2;

        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        const edgeLength = Math.sqrt(dx * dx + dy * dy);
        
        if (edgeLength === 0) return { x: baseX, y: baseY };

        const unitDx = dx / edgeLength;
        const unitDy = dy / edgeLength;

        const normalX = -unitDy;
        const normalY = unitDx;

        const positions = [];
        const steps = 5;
        const offsets = [-20, -15, -10, -5, 0, 5, 10, 15, 20]; 
        
        for (let i = 1; i < steps; i++) {
            const t = i / steps; 
            for (const offset of offsets) {
                const x = fromNode.x + t * dx + normalX * offset;
                const y = fromNode.y + t * dy + normalY * offset;
                positions.push({ x, y, t, offset });
            }
        }

        let bestPosition = { x: baseX, y: baseY, score: Infinity };
        const LABEL_WIDTH = 36;
        const LABEL_HEIGHT = 24;
        
        for (const pos of positions) {
            let score = 0;
            
            for (const otherEdge of allEdges) {
                if (otherEdge === edge) continue;
                
                const otherFromNode = graph.nodes.find(n => n.id === otherEdge.from);
                const otherToNode = graph.nodes.find(n => n.id === otherEdge.to);
                if (!otherFromNode || !otherToNode) continue;
                
                const otherBaseX = (otherFromNode.x + otherToNode.x) / 2;
                const otherBaseY = (otherFromNode.y + otherToNode.y) / 2;
                
                const distance = Math.sqrt(
                    Math.pow(pos.x - otherBaseX, 2) + 
                    Math.pow(pos.y - otherBaseY, 2)
                );

                if (distance < 40) {
                    score += (40 - distance) * 10;
                }
            }

            for (const node of graph.nodes) {
                const distance = Math.sqrt(
                    Math.pow(pos.x - node.x, 2) + 
                    Math.pow(pos.y - node.y, 2)
                );
                
                if (distance < 35) {
                    score += (35 - distance) * 5;
                }
            }

            const centerDistance = Math.abs(pos.t - 0.5);
            score += centerDistance * 5;

            score += Math.abs(pos.offset) * 0.1;
            
            if (score < bestPosition.score) {
                bestPosition = { x: pos.x, y: pos.y, score };
            }
        }
        
        return { x: bestPosition.x, y: bestPosition.y };
    }

    function drawGraph() {
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const isDarkMode = document.body.classList.contains('dark-mode');

        const labelPositions = new Map();
        graph.edges.forEach(edge => {
            const position = calculateOptimalLabelPosition(edge, graph.edges);
            labelPositions.set(edge, position);
        });

        graph.edges.forEach(edge => {
            const fromNode = graph.nodes.find(n => n.id === edge.from);
            const toNode = graph.nodes.find(n => n.id === edge.to);
            if (!fromNode || !toNode) return;
    
            const isInvalid = state.invalidEdges.some(e => (e.from === edge.from && e.to === edge.to) || (e.from === edge.to && e.to === edge.from));
            const isConsidering = state.consideringEdge && ((state.consideringEdge.from === edge.from && state.consideringEdge.to === edge.to) || (state.consideringEdge.from === edge.to && state.consideringEdge.to === edge.from));
            const isHoveredForDelete = state.isDeletingEdge && state.hoveredEdge && 
                ((state.hoveredEdge.from === edge.from && state.hoveredEdge.to === edge.to) ||
                 (state.hoveredEdge.from === edge.to && state.hoveredEdge.to === edge.from));
            const isHovered = state.hoveredEdge && 
                ((state.hoveredEdge.from === edge.from && state.hoveredEdge.to === edge.to) ||
                 (state.hoveredEdge.from === edge.to && state.hoveredEdge.to === edge.from));
    
            ctx.beginPath();
            ctx.moveTo(fromNode.x, fromNode.y);
            ctx.lineTo(toNode.x, toNode.y);
    
            let strokeStyle, lineWidth, textColor, drawTextBackground;
            
            if (edge.isInMST) {
                strokeStyle = '#4CAF50';
                lineWidth = 4;
                textColor = isDarkMode ? '#ffffff' : '#1e1e2f';
                drawTextBackground = true;
            } else if (state.isComplete) {
                strokeStyle = isDarkMode ? 'rgba(156, 39, 176, 0.15)' : 'rgba(106, 27, 154, 0.15)';
                lineWidth = 1;
                textColor = isDarkMode ? 'rgba(255, 255, 255, 0.25)' : 'rgba(30, 30, 47, 0.25)';
                drawTextBackground = false;
            } else if (isInvalid) {
                strokeStyle = '#f44336';
                lineWidth = 6;
                textColor = isDarkMode ? '#ffffff' : '#1e1e2f';
                drawTextBackground = true;
            } else if (isConsidering) {
                strokeStyle = '#FF9800';
                lineWidth = 4;
                textColor = isDarkMode ? '#ffffff' : '#1e1e2f';
                drawTextBackground = true;
            } else if (isHoveredForDelete) {
                strokeStyle = '#f44336';
                lineWidth = 6;
                textColor = isDarkMode ? '#ffffff' : '#1e1e2f';
                drawTextBackground = true;
            } else if (isHovered) {
                strokeStyle = '#00f2fe'; 
                lineWidth = 4;
                textColor = isDarkMode ? '#ffffff' : '#1e1e2f';
                drawTextBackground = true;
            } else {
                strokeStyle = isDarkMode ? '#BB86FC' : '#6a1b9a';
                lineWidth = 2;
                textColor = isDarkMode ? '#ffffff' : '#1e1e2f';
                drawTextBackground = true;
            }
            
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
            
            const labelPos = labelPositions.get(edge);
            const labelX = labelPos?.x || (fromNode.x + toNode.x) / 2;
            const labelY = labelPos?.y || (fromNode.y + toNode.y) / 2;
            
            if (drawTextBackground) {
                ctx.fillStyle = isDarkMode ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)';
                ctx.fillRect(labelX - 18, labelY - 12, 36, 24);
                ctx.strokeStyle = isDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)';
                ctx.lineWidth = 1;
                ctx.strokeRect(labelX - 18, labelY - 12, 36, 24);
            }
            
            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(edge.weight, labelX, labelY);
        });
        
        graph.nodes.forEach(node => {
            const isSelectedForEdge = state.firstNodeForEdge && (
                state.firstNodeForEdge.id === node.id
            );
            const isSecondNodeHighlighted = state.pendingEdge && (
                state.pendingEdge.node1.id === node.id || state.pendingEdge.node2.id === node.id
            );
            const isHoveredForDelete = state.isDeletingNode && state.hoveredNode && state.hoveredNode.id === node.id;

            ctx.beginPath();
            ctx.arc(node.x, node.y, 20, 0, Math.PI * 2);
            ctx.fillStyle = state.visitedNodes.has(node.id) ? '#4CAF50' : '#FF5722';
            ctx.fill();

            if (isHoveredForDelete) {
                ctx.strokeStyle = 'rgba(244, 67, 54, 0.8)'; 
                ctx.lineWidth = 4;
            } else if (isSelectedForEdge || isSecondNodeHighlighted) {
                ctx.strokeStyle = '#00f2fe'; 
                ctx.lineWidth = 4;
            } else {
                ctx.strokeStyle = isDarkMode ? '#ffffff' : '#ffffff';
                ctx.lineWidth = 2;
            }
            ctx.stroke();

            ctx.fillStyle = 'white';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(node.label, node.x, node.y);
        });
        
        updateDataStructuresUI();
        updateStatsUI();
    }
    
    function initializeEventListeners() {
        document.querySelectorAll('.algorithm-btn').forEach(btn => btn.addEventListener('click', (e) => {
            if (state.algorithmLocked) return;
            document.querySelectorAll('.algorithm-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            updateAlgorithmUI();
            resetAnimationState(false);
        }));

        document.getElementById('nodeCount').addEventListener('input', e => {
            document.getElementById('nodeCountValue').textContent = e.target.value;
            updateEdgeDensityForGraphType();
        });
        document.getElementById('edgeDensity').addEventListener('input', e => document.getElementById('edgeDensityValue').textContent = e.target.value + '%');
        
        document.getElementById('animationSpeed').addEventListener('input', e => {
            const speedLabels = ['Slowest', 'Slower', 'Slow', 'Normal-', 'Normal', 'Normal+', 'Fast', 'Faster', 'Fastest', 'Max'];
            document.getElementById('animationSpeedValue').textContent = speedLabels[e.target.value - 1];
            state.speed = parseInt(e.target.value);
            if (state.isRunning && state.intervalId) {
                clearInterval(state.intervalId);
                state.intervalId = setInterval(animateStep, getAnimationDelay());
            }
        });

        document.getElementById('undoBtn').addEventListener('click', undo);
        document.getElementById('redoBtn').addEventListener('click', redo);

        document.getElementById('generateGraph').addEventListener('click', generateGraph);
        document.getElementById('deleteNodeBtn').addEventListener('click', toggleDeleteMode);
        document.getElementById('deleteEdgeBtn').addEventListener('click', toggleDeleteEdgeMode);
        document.getElementById('editWeightBtn').addEventListener('click', toggleEditMode);
        document.getElementById('visualize').addEventListener('click', startVisualization);
        document.getElementById('reset').addEventListener('click', () => {
            resetAnimationState(false); 
        });

        document.getElementById('clearGraphBtn').addEventListener('click', clearGraph);

        document.getElementById('stepForward').addEventListener('click', stepForward);
        document.getElementById('stepBackward').addEventListener('click', stepBackward);
        document.getElementById('pauseResume').addEventListener('click', togglePauseResume);

        document.getElementById('graphTypeSelect').addEventListener('change', () => {
            updateEdgeDensityForGraphType();
            generateGraph();
        });

        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseleave', () => {
            state.draggingNode = null;
            state.potentialDragNode = null;
            if (state.hoveredNode) {
                state.hoveredNode = null;
                drawGraph();
            }
            if (state.hoveredEdge) {
                state.hoveredEdge = null;
                drawGraph();
            }
            hideFixedEdgeInfo();
            state.tooltipEdge = null;
        });

        canvas.addEventListener('mousemove', (e) => {
            if (state.algorithmLocked || state.draggingNode) return;
            
            const { x, y } = getMousePos(e);
            const edge = getEdgeAt(x, y);
            
            if (edge) {
                const fromNode = graph.nodes.find(n => n.id === edge.from);
                const toNode = graph.nodes.find(n => n.id === edge.to);
                
                if (fromNode && toNode) {
                    showFixedEdgeInfo(fromNode.label, toNode.label, edge.weight);
                    state.tooltipEdge = edge;

                    if (state.hoveredEdge !== edge) {
                        state.hoveredEdge = edge;
                        drawGraph();
                    }
                }
            } else {
                if (state.hoveredEdge) {
                    state.hoveredEdge = null;
                    drawGraph();
                }
                hideFixedEdgeInfo();
                state.tooltipEdge = null;
            }
        });

        document.getElementById('modal-confirm-btn').addEventListener('click', () => {
            if (state.nodeToDelete) {
                deleteNodeById(state.nodeToDelete.id, state.nodeToDelete.label);
            }
            hideDeleteModal();
        });
        document.getElementById('modal-cancel-btn').addEventListener('click', hideDeleteModal);
    }

    function showFixedEdgeInfo(fromLabel, toLabel, weight) {
        fixedEdgeInfo.innerHTML = `<strong>Edge:</strong> ${fromLabel}-${toLabel}<br><strong>Weight:</strong> ${weight}`;
        fixedEdgeInfo.classList.remove('hidden');
    }

    function hideFixedEdgeInfo() {
        fixedEdgeInfo.classList.add('hidden');
    }

    function renderPseudocode(algorithm) {
        const container = document.getElementById('pseudocode-display');
        container.innerHTML = '';
        const pseudocode = algorithm === 'prim' ? PRIM_PSEUDOCODE : KRUSKAL_PSEUDOCODE;

        pseudocode.forEach((item, index) => {
            const line = document.createElement('div');
            line.className = 'pseudo-line';
            line.id = `pseudo-line-${index}`;
            line.textContent = item.line;
            line.style.paddingLeft = `${item.indent * 15}px`;
            container.appendChild(line);
        });
    }
    
    function highlightPseudoLine(lineIndex) {
        document.querySelectorAll('.pseudo-line').forEach(line => {
            line.classList.remove('highlight');
        });
        if (lineIndex !== null && lineIndex >= 0) {
            const lineToHighlight = document.getElementById(`pseudo-line-${lineIndex}`);
            if (lineToHighlight) {
                lineToHighlight.classList.add('highlight');
            }
        }
    }

    function updateAlgorithmUI() {
        const selectedAlgo = document.querySelector('.algorithm-btn.active').dataset.algo;
        const primInfo = document.getElementById('primInfoSection');
        const kruskalInfo = document.getElementById('kruskalInfoSection');

        primInfo.style.display = selectedAlgo === 'prim' ? 'block' : 'none';
        kruskalInfo.style.display = selectedAlgo === 'kruskal' ? 'block' : 'none';

        document.getElementById('dsTitle').textContent = selectedAlgo === 'prim' ? 'Priority Queue' : 'Disjoint Sets';
        document.getElementById('visitedTitle').textContent = selectedAlgo === 'prim' ? 'Visited Nodes' : 'Sorted Edges';
        document.getElementById('primOptions').style.display = selectedAlgo === 'prim' ? 'flex' : 'none';

        renderPseudocode(selectedAlgo);
        if (state.mode === 'generative') {
            updateEdgeDensityForGraphType();
        }
    }
    
    function updateUIAfterGraphChange() {
        const startNodeSelect = document.getElementById('startNodeSelect');
        const selectedValue = startNodeSelect.value;
        startNodeSelect.innerHTML = '';
        graph.nodes.sort((a,b) => a.id - b.id).forEach(node => {
            const option = document.createElement('option');
            option.value = node.id;
            option.textContent = `Node ${node.label}`;
            startNodeSelect.appendChild(option);
        });
        if (selectedValue) {
                startNodeSelect.value = selectedValue;
        }
        updateAnimationControls();
        drawGraph();
    }

    function updateStatsUI() {
        document.getElementById('totalNodes').textContent = graph.nodes.length;
        document.getElementById('totalEdges').textContent = graph.edges.length;
        document.getElementById('mstWeight').textContent = graph.mstEdges.reduce((sum, edge) => sum + edge.weight, 0);
    }

    function updateDataStructuresUI() {
        const selectedAlgorithm = document.querySelector('.algorithm-btn.active').dataset.algo;
        const pqContent = document.getElementById('priorityQueueContent');
        const visitedContent = document.getElementById('visitedNodesContent');
        const mstContent = document.getElementById('mstEdgesContent');
        
        pqContent.innerHTML = '';
        visitedContent.innerHTML = '';
        mstContent.innerHTML = '';

        if (selectedAlgorithm === 'prim') {
            if (state.priorityQueue.length === 0) pqContent.innerHTML = '<div class="queue-item">Empty</div>';
            else state.priorityQueue.forEach(item => {
                const fromLabel = graph.nodes.find(n => n.id === item.edge.from)?.label || '?';
                const toLabel = graph.nodes.find(n => n.id === item.edge.to)?.label || '?';
                pqContent.innerHTML += `<div class="queue-item">${fromLabel}-${toLabel} (${item.edge.weight})</div>`;
            });
            
            Array.from(state.visitedNodes).sort((a,b) => a-b).forEach(nodeId => {
                const nodeLabel = graph.nodes.find(n => n.id === nodeId)?.label || '?';
                visitedContent.innerHTML += `<div class="ds-item">${nodeLabel}</div>`;
            });
        } else { 
            if (state.disjointSets.length === 0) pqContent.innerHTML = '<div class="queue-item">Empty</div>';
            else state.disjointSets.forEach((set, i) => {
                const setLabels = set.map(id => graph.nodes.find(n => n.id === id)?.label || '?').join(', ');
                pqContent.innerHTML += `<div class="ds-item component">Set ${i}: {${setLabels}}</div>`;
            });

            if (state.sortedEdges && state.sortedEdges.length > 0) state.sortedEdges.forEach(edge => {
                const fromLabel = graph.nodes.find(n => n.id === edge.from)?.label || '?';
                const toLabel = graph.nodes.find(n => n.id === edge.to)?.label || '?';
                visitedContent.innerHTML += `<div class="ds-item">${fromLabel}-${toLabel} (${edge.weight})</div>`;
            });
            else visitedContent.innerHTML = '<div class="queue-item">Empty</div>';
        }

        graph.mstEdges.forEach(edge => {
            const fromLabel = graph.nodes.find(n => n.id === edge.from)?.label || '?';
            const toLabel = graph.nodes.find(n => n.id === edge.to)?.label || '?';
            mstContent.innerHTML += `<div class="ds-item mst">${fromLabel}-${toLabel} (${edge.weight})</div>`;
        });
    }

    function updateAnimationControls() {
        const hasSteps = state.steps.length > 0;
        const isAtStart = state.currentStep === 0;
        const isAtEnd = state.currentStep >= state.totalSteps;
        
        document.getElementById('stepBackward').disabled = !hasSteps || isAtStart || state.isRunning;
        document.getElementById('stepForward').disabled = !hasSteps || isAtEnd || state.isRunning;
        document.getElementById('pauseResume').disabled = !hasSteps || isAtEnd;
        document.getElementById('reset').disabled = !hasSteps; 
        
        const visualizeBtn = document.getElementById('visualize');
        if (state.mode === 'generative') {

            visualizeBtn.disabled = state.isRunning;
        } else {

            visualizeBtn.disabled = state.isRunning || graph.nodes.length < 2;
        }

        const isLocked = state.algorithmLocked || state.isDeletingNode || state.isEditingEdge || state.isDeletingEdge;
        document.querySelectorAll('.algorithm-btn, #generateGraph, #graphTypeSelect, #nodeCount, #modeToggle').forEach(el => {
                if (el) el.disabled = isLocked;
        });
        
        if (state.mode === 'generative') {
            const graphType = document.getElementById('graphTypeSelect').value;
                if(document.getElementById('edgeDensity')) {
                    document.getElementById('edgeDensity').disabled = isLocked || graphType === 'complete';
            }
            document.getElementById('startNodeSelect').disabled = isLocked || graphType === 'cycle';
        } else {
            document.getElementById('startNodeSelect').disabled = isLocked;
            document.getElementById('deleteNodeBtn').disabled = state.algorithmLocked || state.isEditingEdge || state.isDeletingEdge;
            document.getElementById('deleteEdgeBtn').disabled = state.algorithmLocked || state.isDeletingNode || state.isEditingEdge;
            document.getElementById('editWeightBtn').disabled = state.algorithmLocked || state.isDeletingNode || state.isDeletingEdge;
        }

        if (state.isRunning) {
            document.getElementById('pauseResume').textContent = 'Pause';
            document.getElementById('animationStatus').textContent = `Running (Step ${state.currentStep + 1}/${state.totalSteps})`;
        } else {
            document.getElementById('pauseResume').textContent = 'Resume';
            if (state.isComplete) {
                document.getElementById('animationStatus').textContent = `Visualization Complete`;
            } else {
                document.getElementById('animationStatus').textContent = hasSteps && !isAtEnd ? `Paused (Step ${state.currentStep}/${state.totalSteps})` : 'Ready to visualize';
            }
        }
    }

    function resetFull(forceGenerative = false) {
        if (state.mode === 'user' && !forceGenerative) {
            graph = { nodes: [], edges: [], mstEdges: [] };
            nextNodeId = 0;
            initializeLabels();
            
            state.history.user = [];
            state.historyIndex.user = -1;
            saveState();
        }
        resetAnimationState(true);
    }

    function resetAnimationState(fullReset) {
        if (state.intervalId) clearInterval(state.intervalId);
        state.isRunning = false;
        state.isComplete = false;
        state.currentStep = 0;
        state.totalSteps = 0;
        state.steps = [];
        state.algorithmLocked = false;
        state.consideringEdge = null;
        state.invalidEdges = [];
        state.priorityQueue = [];
        state.visitedNodes = new Set();
        state.disjointSets = [];
        state.sortedEdges = null;
        state.firstNodeForEdge = null;
        
        if (state.isDeletingNode) toggleDeleteMode();
        if (state.isEditingEdge) toggleEditMode();
        if (state.isDeletingEdge) toggleDeleteEdgeMode();

        if (graph.edges) {
            graph.edges.forEach(edge => edge.isInMST = false);
        }
        graph.mstEdges = [];
        
        highlightPseudoLine(null);

        if (fullReset) {
            const message = state.mode === 'user' 
                ? 'Click on the canvas to create a graph, then click "Visualize" , User Mode Instructions given below.'
                : 'Generate a graph, then click "Visualize" to see the steps here.';
            document.getElementById('algorithm-steps-panel').innerHTML = message;
        }
        
        updateAnimationControls();
        drawGraph();
    }
    
    function handleMouseDown(e) {
        if (state.algorithmLocked) return;
    
        const { x, y } = getMousePos(e);
        const clickedNode = getNodeAt(x, y);
    
        if (clickedNode) {
            if (state.mode === 'user') {
                if (state.isDeletingNode) {
                    showDeleteModal(clickedNode);
                } else if (!state.isEditingEdge && !state.isDeletingEdge) {
                    state.potentialDragNode = clickedNode;
                    state.mouseDownPos = { x, y };
                }
            } else { 
                state.draggingNode = clickedNode;
                state.dragOffset = { x: x - clickedNode.x, y: y - clickedNode.y };
            }
        } else if (state.mode === 'user') {
            const clickedEdge = state.isEditingEdge || state.isDeletingEdge ? getEdgeAt(x, y) : null;
            if (clickedEdge) {
                if (state.isEditingEdge) {
                    handleEdgeEdit(clickedEdge);
                } else if (state.isDeletingEdge) {
                    showDeleteEdgeModal(clickedEdge);
                }
            } else if (!state.isDeletingNode && !state.isEditingEdge && !state.isDeletingEdge) {
                handleCanvasClick(x, y);
            }
        }
    }

    function handleMouseMove(e) {
        const { x, y } = getMousePos(e);

        if (state.potentialDragNode && state.mode === 'user') {
            const dx = x - state.mouseDownPos.x;
            const dy = y - state.mouseDownPos.y;
            if (Math.sqrt(dx * dx + dy * dy) > 5) { 
                state.draggingNode = state.potentialDragNode;
                state.dragOffset = { x: x - state.draggingNode.x, y: y - state.draggingNode.y };
                state.potentialDragNode = null;
                if (state.firstNodeForEdge) state.firstNodeForEdge = null;
            }
        }

        if (state.draggingNode) {
            state.draggingNode.x = x - state.dragOffset.x;
            state.draggingNode.y = y - state.dragOffset.y;
            drawGraph();
        } else if (state.isDeletingNode) {
            const currentNode = getNodeAt(x, y);
            if (currentNode !== state.hoveredNode) {
                state.hoveredNode = currentNode;
                drawGraph();
            }
        } else if (state.isDeletingEdge) {
            const currentEdge = getEdgeAt(x, y);
            if (currentEdge !== state.hoveredEdge) {
                state.hoveredEdge = currentEdge;
                drawGraph();
            }
        }
    }

    function handleMouseUp(e) {
        if (state.potentialDragNode) { 
                handleNodeSelection(state.potentialDragNode);
        }
        state.potentialDragNode = null;
        state.draggingNode = null;
    }

    // USER MODE
    function handleCanvasClick(x, y) {
        if (availableLabels.length === 0) {
            showToast("Maximum number of nodes reached (A-Z).", "warning");
            return;
        }

        const newLabel = availableLabels.shift();
        graph.nodes.push({ id: nextNodeId++, x, y, label: newLabel });
        updateUIAfterGraphChange();
        
        saveState();
    }

    function handleNodeSelection(node) {
        if (!state.firstNodeForEdge) {
            state.firstNodeForEdge = node;
            drawGraph();
        } else {
            if (state.firstNodeForEdge.id === node.id) {
                state.firstNodeForEdge = null;
                drawGraph();
                return;
            }

            const edgeExists = graph.edges.some(e =>
                (e.from === state.firstNodeForEdge.id && e.to === node.id) ||
                (e.from === node.id && e.to === state.firstNodeForEdge.id)
            );

            if (edgeExists) {
                showToast("An edge already exists between these two nodes.", "warning");
                state.firstNodeForEdge = null;
                drawGraph();
                return;
            }

            state.pendingEdge = { node1: state.firstNodeForEdge, node2: node };
            drawGraph();

            requestAnimationFrame(() => {
                showWeightInputModal(state.firstNodeForEdge, node);
            });
        }
    }

    function deleteNodeById(nodeId, nodeLabel) {
 
        graph.nodes = graph.nodes.filter(n => n.id !== nodeId);
        graph.edges = graph.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
        
        availableLabels.push(nodeLabel);
        availableLabels.sort();

        updateUIAfterGraphChange();

        saveState();
    }

    function handleEdgeEdit(edge) {

        const fromNode = graph.nodes.find(n => n.id === edge.from);
        const toNode = graph.nodes.find(n => n.id === edge.to);

        const modalOverlay = document.getElementById('custom-modal-overlay');
        const modalText = document.getElementById('modal-text');
        
        modalText.innerHTML = `
            <div style="text-align: center;">
                <h3 style="margin-bottom: 15px; color: var(--color-primary);">Edit Edge Weight</h3>
                <p style="margin-bottom: 20px;">Enter new weight for edge <strong>${fromNode.label}-${toNode.label}</strong>:</p>
                <input type="number" id="edgeWeightInput" min="1" value="${edge.weight}" style="
                    width: 100%;
                    padding: 10px;
                    border: 2px solid var(--color-border);
                    border-radius: 8px;
                    background: var(--color-bg-light);
                    color: var(--color-text);
                    font-size: 1.1rem;
                    text-align: center;
                    margin-bottom: 20px;
                " />
            </div>
        `;
        
        modalOverlay.classList.remove('hidden');
        
        setTimeout(() => {
            const input = document.getElementById('edgeWeightInput');
            if (input) {
                input.focus();
                input.select();
            }
        }, 100);
        
        state.pendingEdgeEdit = edge;
        
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        
        confirmBtn.textContent = 'Update Weight';
        confirmBtn.onclick = confirmEdgeEdit;
        cancelBtn.onclick = cancelEdgeEdit;
    }

    function toggleDeleteEdgeMode() {
        state.isDeletingEdge = !state.isDeletingEdge;
        const btn = document.getElementById('deleteEdgeBtn');

        if (state.isDeletingEdge) {
            if (state.isDeletingNode) toggleDeleteMode();
            if (state.isEditingEdge) toggleEditMode();
            btn.classList.add('active');
            btn.textContent = 'Stop Edge Deletion';
            state.firstNodeForEdge = null;
            showToast("Delete Edge mode active. Click an edge to remove it.", "info");
        } else {
            btn.classList.remove('active');
            btn.textContent = 'Delete Edge';
            state.hoveredEdge = null;
            state.edgeToDelete = null;
        }
        updateCanvasCursor();
        updateAnimationControls();
        drawGraph();
    }
    
    function toggleEditMode() {
        state.isEditingEdge = !state.isEditingEdge;
        const btn = document.getElementById('editWeightBtn');
        if (state.isEditingEdge) {
            if(state.isDeletingNode) toggleDeleteMode();
            if(state.isDeletingEdge) toggleDeleteEdgeMode();
            btn.classList.add('active');
            btn.textContent = 'Stop Edit';
            showToast("Edit mode active. Click an edge weight to change it.", "info");
        } else {
            btn.classList.remove('active');
            btn.textContent = 'Edit Weight';
        }
        updateCanvasCursor();
        updateAnimationControls();
    }

    function toggleDeleteMode() {
        state.isDeletingNode = !state.isDeletingNode;
        const btn = document.getElementById('deleteNodeBtn');

        if (state.isDeletingNode) {
                if(state.isEditingEdge) toggleEditMode();
                if(state.isDeletingEdge) toggleDeleteEdgeMode();
            btn.classList.add('active');
            btn.textContent = 'Stop Deletion';
            state.firstNodeForEdge = null;
            showToast("Delete mode active. Click a node to remove it.", "info");
        } else {
            btn.classList.remove('active');
            btn.textContent = 'Delete Node';
            state.hoveredNode = null;
            state.nodeToDelete = null;
        }
        updateCanvasCursor();
        updateAnimationControls();
        drawGraph();
    }

    function updateCanvasCursor() {
        const canvasContainer = document.querySelector('.canvas-container');
        if (state.mode === 'generative') {
            canvasContainer.style.cursor = 'grab';
        } else {
            if (state.isDeletingNode) canvasContainer.style.cursor = 'not-allowed';
            else if (state.isEditingEdge || state.isDeletingEdge) canvasContainer.style.cursor = 'pointer';
            else canvasContainer.style.cursor = 'crosshair';
        }
    }

    function showDeleteModal(node) {
        state.nodeToDelete = node;
        document.getElementById('modal-text').textContent = `Delete node ${node.label} and all its edges?`;
        modalOverlay.classList.remove('hidden');
    }

    function hideDeleteModal() {
        state.nodeToDelete = null;
        modalOverlay.classList.add('hidden');

    }

    function showDeleteEdgeModal(edge) {
        const fromNode = graph.nodes.find(n => n.id === edge.from);
        const toNode = graph.nodes.find(n => n.id === edge.to);
        state.edgeToDelete = edge;
        document.getElementById('modal-text').textContent = `Delete edge between ${fromNode.label} and ${toNode.label} (weight: ${edge.weight})?`;
        modalOverlay.classList.remove('hidden');
        
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        
        confirmBtn.textContent = 'Delete Edge';
        confirmBtn.onclick = confirmEdgeDeletion;
        cancelBtn.onclick = hideDeleteEdgeModal;
    }

    function confirmEdgeDeletion() {
        if (state.edgeToDelete) {
 
            graph.edges = graph.edges.filter(e => 
                !(e.from === state.edgeToDelete.from && e.to === state.edgeToDelete.to)
            );
            graph.mstEdges = graph.mstEdges.filter(e => 
                !(e.from === state.edgeToDelete.from && e.to === state.edgeToDelete.to)
            );
            
     
            if (state.isDeletingEdge) {
                toggleDeleteEdgeMode();
            }
            
            hideDeleteEdgeModal();
            updateUIAfterGraphChange();
  
            saveState();
            
            showToast("Edge deleted successfully", "success");
        }
    }

    function hideDeleteEdgeModal() {
        state.edgeToDelete = null;
        modalOverlay.classList.add('hidden');

        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        
        confirmBtn.textContent = 'Confirm';
        confirmBtn.onclick = confirmDelete;
        cancelBtn.onclick = hideDeleteModal;
    }

    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function getNodeAt(x, y) {
        for (let i = graph.nodes.length - 1; i >= 0; i--) {
            const node = graph.nodes[i];
            if (Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2) <= 20) return node;
        }
        return null;
    }

    function getEdgeAt(x, y) {
        const EDGE_HOVER_THRESHOLD = 10; 
        
        for (const edge of graph.edges) {
            const fromNode = graph.nodes.find(n => n.id === edge.from);
            const toNode = graph.nodes.find(n => n.id === edge.to);
            if (!fromNode || !toNode) continue;

            const distance = pointToLineDistance(x, y, fromNode.x, fromNode.y, toNode.x, toNode.y);

            const labelPos = calculateOptimalLabelPosition(edge, graph.edges);
            const labelDistance = Math.sqrt((x - labelPos.x) ** 2 + (y - labelPos.y) ** 2);

            if (distance < EDGE_HOVER_THRESHOLD || labelDistance < 15) {
                return edge;
            }
        }
        return null;
    }

    function pointToLineDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) {
            param = dot / lenSq;
        }

        let xx, yy;

        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        const dx = px - xx;
        const dy = py - yy;
        
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    function togglePauseResume() {
        if (state.isRunning) {
            clearInterval(state.intervalId);
            state.intervalId = null;
            state.isRunning = false;
        } else if (state.currentStep < state.totalSteps) {
            state.isRunning = true;
            state.intervalId = setInterval(animateStep, getAnimationDelay());
        }
        updateAnimationControls();
    }
    
    function stepForward() {
        if (state.currentStep < state.totalSteps) {
            if (state.isRunning) { 
                clearInterval(state.intervalId); 
                state.isRunning = false; 
            }
            executeStep(state.currentStep);
            state.currentStep++;
            updateAnimationControls();

            if (state.currentStep >= state.totalSteps) {
                state.isComplete = true;
                state.algorithmLocked = false;
                
                const totalWeight = graph.mstEdges.reduce((sum, edge) => sum + edge.weight, 0);
                document.getElementById('algorithm-steps-panel').innerHTML = 
                    `<div class="step-highlight">Algorithm complete!</div>
                        <div class="step-explanation">MST has ${graph.mstEdges.length} edges with total weight ${totalWeight}.</div>`;
                
                updateAnimationControls();
                drawGraph();
            }
        }
    }

    function stepBackward() {
        if (state.currentStep > 0) {
            if (state.isRunning) { 
                clearInterval(state.intervalId); 
                state.isRunning = false; 
            }
            if(state.isComplete) {
                state.isComplete = false;
            }
            state.currentStep--;
            
            graph.edges.forEach(edge => edge.isInMST = false);
            graph.mstEdges = [];
            state.priorityQueue = [];
            state.visitedNodes = new Set();
            state.disjointSets = [];
            state.sortedEdges = null;
            state.consideringEdge = null;
            state.invalidEdges = [];
            
            for (let i = 0; i < state.currentStep; i++) {
                const step = state.steps[i];
                if (step.action === 'addEdge') {
                    const edge = graph.edges.find(e => 
                        (e.from === step.edge.from && e.to === step.edge.to) || 
                        (e.from === step.edge.to && e.to === step.edge.from)
                    );
                    if (edge && !edge.isInMST) {
                        edge.isInMST = true;
                        graph.mstEdges.push(edge);
                    }
                }
                
                if (step.priorityQueue) state.priorityQueue = step.priorityQueue;
                if (step.visitedNodes) state.visitedNodes = new Set(step.visitedNodes);
                if (step.disjointSets) state.disjointSets = step.disjointSets;
                if (step.sortedEdges) state.sortedEdges = step.sortedEdges;
            }
            
            if (state.currentStep > 0) {
                const prevStep = state.steps[state.currentStep - 1];
                document.getElementById('algorithm-steps-panel').innerHTML = prevStep.description;
                
                if (prevStep.action === 'considerEdge') {
                    state.consideringEdge = prevStep.edge;
                } else if (prevStep.action === 'showInvalid') {
                    state.invalidEdges = prevStep.invalidEdges || [];
                }
                highlightPseudoLine(prevStep.pseudoLine);
            } else {
                    const message = state.mode === 'user' 
                    ? 'Click on the canvas to create a graph, then click "Visualize".'
                    : 'Generate a graph, then click "Visualize" to see the steps here.';
                document.getElementById('algorithm-steps-panel').innerHTML = message;
                highlightPseudoLine(null);
            }
            
            drawGraph();
            updateAnimationControls();
        }
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');

            setTimeout(() => toast.remove(), 500); 
        }, 3000);
    }

    function saveState() {
        const currentState = {
            nodes: clone(graph.nodes),
            edges: clone(graph.edges),
            mstEdges: clone(graph.mstEdges),
            nextNodeId: nextNodeId,
            availableLabels: clone(availableLabels)
        };
        
        const mode = state.mode;
        const modeHistory = state.history[mode];
        const currentIndex = state.historyIndex[mode];

        if (currentIndex < modeHistory.length - 1) {
            state.history[mode] = modeHistory.slice(0, currentIndex + 1);
        }

        if (modeHistory.length === 0 || !isEqual(currentState, modeHistory[modeHistory.length - 1])) {
            state.history[mode].push(currentState);
            state.historyIndex[mode] = state.history[mode].length - 1;

            if (state.history[mode].length > 50) {
                state.history[mode].shift();
                state.historyIndex[mode]--;
            }
        }
        
        updateUndoRedoButtons();
    }

    function undo() {
        const mode = state.mode;
        const currentIndex = state.historyIndex[mode];
        
        if (currentIndex > 0) {
            state.historyIndex[mode]--;
            restoreState(state.history[mode][state.historyIndex[mode]]);
        }
    }

    function redo() {
        const mode = state.mode;
        const modeHistory = state.history[mode];
        const currentIndex = state.historyIndex[mode];
        
        if (currentIndex < modeHistory.length - 1) {
            state.historyIndex[mode]++;
            restoreState(modeHistory[state.historyIndex[mode]]);
        }
    }

    function restoreState(savedState) {
        graph.nodes = clone(savedState.nodes);
        graph.edges = clone(savedState.edges);
        graph.mstEdges = clone(savedState.mstEdges);
        nextNodeId = savedState.nextNodeId;
        availableLabels = clone(savedState.availableLabels);
        
        updateUIAfterGraphChange();
        updateUndoRedoButtons();
    }

    function updateUndoRedoButtons() {
        const undoBtn = document.getElementById('undoBtn');
        const redoBtn = document.getElementById('redoBtn');
        
        const mode = state.mode;
        const modeHistory = state.history[mode];
        const currentIndex = state.historyIndex[mode];
        
        if (undoBtn) undoBtn.disabled = currentIndex <= 0;
        if (redoBtn) redoBtn.disabled = currentIndex >= modeHistory.length - 1;
    }

    function isEqual(state1, state2) {
        return JSON.stringify(state1) === JSON.stringify(state2);
    }

    function showWeightInputModal(node1, node2) {
        const modalOverlay = document.getElementById('custom-modal-overlay');
        const modalText = document.getElementById('modal-text');
        
        modalText.innerHTML = `
            <div style="text-align: center;">
                <h3 style="margin-bottom: 15px; color: var(--color-primary);">Add Edge</h3>
                <p style="margin-bottom: 20px;">Enter weight for edge between <strong>${node1.label}</strong> and <strong>${node2.label}</strong>:</p>
                <input type="number" id="edgeWeightInput" min="1" value="1" style="
                    width: 100%;
                    padding: 10px;
                    border: 2px solid var(--color-border);
                    border-radius: 8px;
                    background: var(--color-bg-light);
                    color: var(--color-text);
                    font-size: 1.1rem;
                    text-align: center;
                    margin-bottom: 20px;
                " />
            </div>
        `;
        
        modalOverlay.classList.remove('hidden');
        
        setTimeout(() => {
            const input = document.getElementById('edgeWeightInput');
            if (input) {
                input.focus();
                input.select();
            }
        }, 100);
        
        state.pendingEdge = { node1, node2 };
        
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        
        confirmBtn.textContent = 'Add Edge';
        confirmBtn.onclick = confirmEdgeAddition;
        cancelBtn.onclick = cancelEdgeAddition;
    }

    function confirmEdgeAddition() {
        const input = document.getElementById('edgeWeightInput');
        const weight = parseInt(input.value);
        
        if (isNaN(weight) || weight <= 0) {
            showToast("Please enter a valid positive number for the weight.", "error");
            return;
        }
        
        if (state.pendingEdge) {
            graph.edges.push({ 
                from: state.pendingEdge.node1.id, 
                to: state.pendingEdge.node2.id, 
                weight, 
                isInMST: false 
            });

            state.firstNodeForEdge = null;
            state.pendingEdge = null;
            
            hideModal();
            updateUIAfterGraphChange();

            saveState();
            
            showToast(`Edge added with weight ${weight}`, "success");
        }
    }

    function cancelEdgeAddition() {
        state.firstNodeForEdge = null;
        state.pendingEdge = null;
        hideModal();
        drawGraph();
    }

    function confirmEdgeEdit() {
        const input = document.getElementById('edgeWeightInput');
        const newWeight = parseInt(input.value);
        
        if (isNaN(newWeight) || newWeight <= 0) {
            showToast("Please enter a valid positive number for the weight.", "error");
            return;
        }
        
        if (state.pendingEdgeEdit) {
            state.pendingEdgeEdit.weight = newWeight;
            state.pendingEdgeEdit = null;
            
            hideModal();
            
            if (state.isEditingEdge) {
                toggleEditMode();
            }
            
            drawGraph();
 
            saveState();
            
            showToast(`Edge weight updated to ${newWeight}`, "success");
        }
    }

    function cancelEdgeEdit() {
        state.pendingEdgeEdit = null;
        hideModal();
    }

    function hideModal() {
        const modalOverlay = document.getElementById('custom-modal-overlay');
        modalOverlay.classList.add('hidden');

        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        
        confirmBtn.textContent = 'Confirm';
        confirmBtn.onclick = confirmDelete;
        cancelBtn.onclick = hideDeleteModal;
    }

    function confirmDelete() {
        if (state.nodeToDelete) {
            deleteNodeById(state.nodeToDelete.id, state.nodeToDelete.label);
        }
        hideDeleteModal();
    }

    function clearGraph() {
        if (state.mode !== 'user') {
            showToast("Clear Graph is only available in User mode.", "warning");
            return;
        }
        
        if (graph.nodes.length === 0 && graph.edges.length === 0) {
            showToast("Graph is already empty.", "info");
            return;
        }

        saveState();

        graph.nodes = [];
        graph.edges = [];
        graph.mstEdges = [];
        nextNodeId = 0;
        initializeLabels();

        state.firstNodeForEdge = null;
        state.pendingEdge = null;
        if (state.isDeletingNode) toggleDeleteMode();
        if (state.isEditingEdge) toggleEditMode();
        if (state.isDeletingEdge) toggleDeleteEdgeMode();

        resetAnimationState(true);

        state.history.user = [];
        state.historyIndex.user = -1;
        saveState();
        
        updateUIAfterGraphChange();
        showToast("Graph cleared successfully.", "success");
    }

    function getAnimationDelay() { return 2200 - (state.speed * 200); }
    function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

    updateEdgeDensityForGraphType();

    saveState();
});