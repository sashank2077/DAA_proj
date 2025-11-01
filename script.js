// Canvas setup
const canvas = document.getElementById('graphCanvas');
const ctx = canvas.getContext('2d');

// Set canvas dimensions
function setCanvasSize() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
}

setCanvasSize();
window.addEventListener('resize', setCanvasSize);

// Graph data structure
let graph = {
    nodes: [],
    edges: [],
    mstEdges: []
};

// Animation state
let animationState = {
    isRunning: false,
    currentStep: 0,
    totalSteps: 0,
    steps: [],
    speed: 5,
    intervalId: null,
    consideringEdge: null,
    invalidEdges: [],
    cycleEdges: [],
    cycleNodes: [],
    priorityQueue: [],
    visitedNodes: new Set(),
    disjointSets: [],
    processedEdges: new Set(),
    draggingNode: null,
    dragOffset: { x: 0, y: 0 },
    algorithmLocked: false
};

// Algorithm information
const algorithmInfo = {
    prim: {
        title: "Prim's Algorithm",
        description: `<p><strong>Prim's Algorithm:</strong> Builds MST by growing from a starting node, always adding the minimum weight edge that connects to a new node.</p>
                    <div class="complexity-info">
                        <strong>Time Complexity:</strong> O(E log V) with priority queue<br>
                        <strong>Space Complexity:</strong> O(V + E)<br>
                        <strong>Data Structure:</strong> Priority Queue (Min-Heap)
                    </div>`
    },
    kruskal: {
        title: "Kruskal's Algorithm", 
        description: `<p><strong>Kruskal's Algorithm:</strong> Builds MST by sorting all edges and adding them in ascending order, using union-find to avoid cycles.</p>
                    <div class="complexity-info">
                        <strong>Time Complexity:</strong> O(E log E) for sorting<br>
                        <strong>Space Complexity:</strong> O(V + E)<br>
                        <strong>Data Structure:</strong> Disjoint Set (Union-Find)
                    </div>`
    }
};

// Initialize event listeners
document.getElementById('currentAlgorithmTitle').textContent = algorithmInfo.prim.title;
document.getElementById('algorithmInfo').innerHTML = algorithmInfo.prim.description;

// Algorithm selection with locking and data clearing
const primBtn = document.getElementById('primBtn');
const kruskalBtn = document.getElementById('kruskalBtn');

function updateAlgorithmButtons() {
    if (animationState.algorithmLocked) {
        primBtn.disabled = true;
        kruskalBtn.disabled = true;
    } else {
        primBtn.disabled = false;
        kruskalBtn.disabled = false;
    }
}

function clearDataStructures() {
    document.getElementById('priorityQueueContent').innerHTML = '<div class="queue-item">Queue Empty</div>';
    document.getElementById('visitedNodesContent').innerHTML = '';
    document.getElementById('mstEdgesContent').innerHTML = '';
}

function resetAnimationState() {
    animationState.consideringEdge = null;
    animationState.invalidEdges = [];
    animationState.cycleEdges = [];
    animationState.cycleNodes = [];
    animationState.priorityQueue = [];
    animationState.visitedNodes = new Set();
    animationState.disjointSets = [];
    animationState.processedEdges = new Set();
    animationState.sortedEdges = null;
    
    // Clear MST edges and reset highlights
    graph.mstEdges = [];
    graph.edges.forEach(edge => {
        edge.isInMST = false;
    });
    
    document.getElementById('stepInfo').textContent = 'Click "Visualize" to start the algorithm visualization.';
    drawGraph();
}

primBtn.addEventListener('click', function() {
    if (animationState.algorithmLocked) return;
    
    document.querySelectorAll('.algorithm-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    document.getElementById('currentAlgorithmTitle').textContent = algorithmInfo.prim.title;
    document.getElementById('algorithmInfo').innerHTML = algorithmInfo.prim.description;
    document.getElementById('dsTitle').textContent = 'Priority Queue (Min-Heap)';
    document.getElementById('visitedTitle').textContent = 'Visited Nodes';
    
    // Clear data structures when switching
    clearDataStructures();
    resetAnimationState();
});

kruskalBtn.addEventListener('click', function() {
    if (animationState.algorithmLocked) return;
    
    document.querySelectorAll('.algorithm-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    document.getElementById('currentAlgorithmTitle').textContent = algorithmInfo.kruskal.title;
    document.getElementById('algorithmInfo').innerHTML = algorithmInfo.kruskal.description;
    document.getElementById('dsTitle').textContent = 'Disjoint Sets';
    document.getElementById('visitedTitle').textContent = 'Sorted Edges';
    
    // Clear data structures when switching
    clearDataStructures();
    resetAnimationState();
});

// Update slider values
document.getElementById('nodeCount').addEventListener('input', function() {
    document.getElementById('nodeCountValue').textContent = this.value;
});

document.getElementById('edgeDensity').addEventListener('input', function() {
    document.getElementById('edgeDensityValue').textContent = this.value + '%';
});

document.getElementById('animationSpeed').addEventListener('input', function() {
    const speedLabels = ['Very Slow', 'Slow', 'Medium', 'Fast', 'Very Fast'];
    const speedIndex = Math.floor((this.value - 1) / 2);
    document.getElementById('animationSpeedValue').textContent = speedLabels[speedIndex];
    animationState.speed = parseInt(this.value);
    
    if (animationState.isRunning && animationState.intervalId) {
        clearInterval(animationState.intervalId);
        animationState.intervalId = setInterval(animateStep, getAnimationDelay());
    }
});

// Generate a graph with guaranteed cycles
document.getElementById('generateGraph').addEventListener('click', generateGraph);

function generateGraph() {
    const nodeCount = parseInt(document.getElementById('nodeCount').value);
    const edgeDensity = parseInt(document.getElementById('edgeDensity').value) / 100;
    
    graph.nodes = [];
    graph.edges = [];
    graph.mstEdges = [];
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) * 0.35;
    
    for (let i = 0; i < nodeCount; i++) {
        const angle = (2 * Math.PI * i) / nodeCount;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        
        graph.nodes.push({
            id: i,
            x: x,
            y: y,
            label: String.fromCharCode(65 + i)
        });
    }
    
    createSpanningTree();
    addGuaranteedCycleEdges(edgeDensity);
    resetAnimation();
    updateStats();
    drawGraph();
}

function createSpanningTree() {
    const visited = new Set();
    const unvisited = new Set([...Array(graph.nodes.length).keys()]);
    
    const startNode = Math.floor(Math.random() * graph.nodes.length);
    visited.add(startNode);
    unvisited.delete(startNode);
    
    while (unvisited.size > 0) {
        const visitedArray = Array.from(visited);
        const fromNode = visitedArray[Math.floor(Math.random() * visitedArray.length)];
        const unvisitedArray = Array.from(unvisited);
        const toNode = unvisitedArray[Math.floor(Math.random() * unvisitedArray.length)];
        
        const weight = Math.floor(Math.random() * 20) + 1;
        graph.edges.push({
            from: fromNode,
            to: toNode,
            weight: weight,
            isInMST: false
        });
        
        visited.add(toNode);
        unvisited.delete(toNode);
    }
}

function addGuaranteedCycleEdges(edgeDensity) {
    const nodeCount = graph.nodes.length;
    const maxPossibleEdges = nodeCount * (nodeCount - 1) / 2;
    const currentEdges = graph.edges.length;
    const targetEdges = Math.max(currentEdges, Math.floor(edgeDensity * maxPossibleEdges));

    // For small graphs (5-6 nodes), create strategic cycles
    if (nodeCount <= 6) {
        // Create 1-2 small cycles that are likely to be encountered
        const cyclesToCreate = Math.max(1, Math.floor(nodeCount / 3));
        
        for (let cycle = 0; cycle < cyclesToCreate; cycle++) {
            // Create triangles (3-node cycles) which are very likely to be detected
            let cycleNodes = [];
            
            // Pick 3 nodes that form a triangle
            while (cycleNodes.length < 3) {
                const randomNode = Math.floor(Math.random() * nodeCount);
                if (!cycleNodes.includes(randomNode)) {
                    cycleNodes.push(randomNode);
                }
            }
            
            // Create the triangle cycle
            for (let i = 0; i < 3; i++) {
                const fromNode = cycleNodes[i];
                const toNode = cycleNodes[(i + 1) % 3];
                
                const edgeExists = graph.edges.some(edge => 
                    (edge.from === fromNode && edge.to === toNode) || 
                    (edge.from === toNode && edge.to === fromNode)
                );
                
                if (!edgeExists) {
                    const weight = Math.floor(Math.random() * 20) + 1;
                    graph.edges.push({
                        from: fromNode,
                        to: toNode,
                        weight: weight,
                        isInMST: false
                    });
                }
            }
        }
    } else {
        // For larger graphs, use the original approach
        const cyclesToCreate = Math.max(2, Math.floor(nodeCount / 3));
        
        for (let cycle = 0; cycle < cyclesToCreate; cycle++) {
            const cycleSize = Math.floor(Math.random() * 3) + 3; // 3-5 nodes
            const cycleNodes = [];
            
            while (cycleNodes.length < cycleSize) {
                const randomNode = Math.floor(Math.random() * nodeCount);
                if (!cycleNodes.includes(randomNode)) {
                    cycleNodes.push(randomNode);
                }
            }
            
            // Create complete cycle
            for (let i = 0; i < cycleSize; i++) {
                const fromNode = cycleNodes[i];
                const toNode = cycleNodes[(i + 1) % cycleSize];
                
                const edgeExists = graph.edges.some(edge => 
                    (edge.from === fromNode && edge.to === toNode) || 
                    (edge.from === toNode && edge.to === fromNode)
                );
                
                if (!edgeExists) {
                    const weight = Math.floor(Math.random() * 20) + 1;
                    graph.edges.push({
                        from: fromNode,
                        to: toNode,
                        weight: weight,
                        isInMST: false
                    });
                }
            }
        }
    }
    
    // Add more random edges to reach target density
    while (graph.edges.length < targetEdges && graph.edges.length < maxPossibleEdges) {
        const fromNode = Math.floor(Math.random() * nodeCount);
        let toNode = Math.floor(Math.random() * nodeCount);
        
        if (fromNode !== toNode) {
            const edgeExists = graph.edges.some(edge => 
                (edge.from === fromNode && edge.to === toNode) || 
                (edge.from === toNode && edge.to === fromNode)
            );
            
            if (!edgeExists) {
                const weight = Math.floor(Math.random() * 20) + 1;
                graph.edges.push({
                    from: fromNode,
                    to: toNode,
                    weight: weight,
                    isInMST: false
                });
            }
        }
    }
}

function getAnimationDelay() {
    return 2200 - (animationState.speed * 200);
}

function updateStats() {
    document.getElementById('totalNodes').textContent = graph.nodes.length;
    document.getElementById('totalEdges').textContent = graph.edges.length;
    
    const totalWeight = graph.mstEdges.reduce((sum, edge) => sum + edge.weight, 0);
    document.getElementById('mstWeight').textContent = totalWeight;
}

function updateDataStructures() {
    const pqContent = document.getElementById('priorityQueueContent');
    pqContent.innerHTML = '';
    
    const selectedAlgorithm = document.querySelector('.algorithm-btn.active').dataset.algo;
    
    if (selectedAlgorithm === 'prim') {
        if (animationState.priorityQueue.length === 0) {
            const emptyItem = document.createElement('div');
            emptyItem.className = 'queue-item';
            emptyItem.textContent = 'Queue Empty';
            pqContent.appendChild(emptyItem);
        } else {
            animationState.priorityQueue.forEach((item) => {
                const div = document.createElement('div');
                div.className = 'queue-item';
                
                if (item.edge) {
                    const fromLabel = graph.nodes[item.edge.from].label;
                    const toLabel = graph.nodes[item.edge.to].label;
                    div.textContent = `${fromLabel}-${toLabel} (${item.edge.weight})`;
                }
                pqContent.appendChild(div);
            });
        }
    } else {
        // For Kruskal's algorithm, show disjoint sets
        if (animationState.disjointSets.length === 0) {
            const emptyItem = document.createElement('div');
            emptyItem.className = 'queue-item';
            emptyItem.textContent = 'No Sets';
            pqContent.appendChild(emptyItem);
        } else {
            animationState.disjointSets.forEach((set, index) => {
                const div = document.createElement('div');
                div.className = 'ds-item component';
                const setLabels = set.map(nodeId => graph.nodes[nodeId].label).join(', ');
                div.textContent = `Set ${index}: {${setLabels}}`;
                pqContent.appendChild(div);
            });
        }
    }
    
    const visitedContent = document.getElementById('visitedNodesContent');
    visitedContent.innerHTML = '';
    
    if (selectedAlgorithm === 'prim') {
        Array.from(animationState.visitedNodes).sort().forEach(nodeId => {
            const div = document.createElement('div');
            div.className = 'ds-item';
            div.textContent = graph.nodes[nodeId].label;
            visitedContent.appendChild(div);
        });
    } else {
        // For Kruskal's algorithm, show sorted edges
        if (animationState.sortedEdges) {
            animationState.sortedEdges.forEach(edge => {
                const div = document.createElement('div');
                div.className = 'ds-item';
                const fromLabel = graph.nodes[edge.from].label;
                const toLabel = graph.nodes[edge.to].label;
                div.textContent = `${fromLabel}-${toLabel} (${edge.weight})`;
                visitedContent.appendChild(div);
            });
        }
    }
    
    const mstContent = document.getElementById('mstEdgesContent');
    mstContent.innerHTML = '';
    graph.mstEdges.forEach(edge => {
        const div = document.createElement('div');
        div.className = 'ds-item mst';
        const fromLabel = graph.nodes[edge.from].label;
        const toLabel = graph.nodes[edge.to].label;
        div.textContent = `${fromLabel}-${toLabel} (${edge.weight})`;
        mstContent.appendChild(div);
    });
}

function drawGraph() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw edges first
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = 'white';
    
    graph.edges.forEach(edge => {
        const fromNode = graph.nodes[edge.from];
        const toNode = graph.nodes[edge.to];
        
        ctx.beginPath();
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.lineTo(toNode.x, toNode.y);
        
        // Check if this edge is invalid or part of a cycle
        const isInvalid = animationState.invalidEdges.some(invEdge => 
            (invEdge.from === edge.from && invEdge.to === edge.to) || 
            (invEdge.from === edge.to && invEdge.to === edge.from)
        );
        
        const isInCycle = animationState.cycleEdges.some(ce => 
            (ce.from === edge.from && ce.to === edge.to) || 
            (ce.from === edge.to && ce.to === edge.from)
        );
        
        if (edge.isInMST) {
            ctx.strokeStyle = '#4CAF50';
            ctx.lineWidth = 4;
        } else if (isInvalid || isInCycle) {
            ctx.strokeStyle = '#f44336';
            ctx.lineWidth = 4;
        } else if (animationState.consideringEdge && 
                  ((animationState.consideringEdge.from === edge.from && animationState.consideringEdge.to === edge.to) ||
                   (animationState.consideringEdge.from === edge.to && animationState.consideringEdge.to === edge.from))) {
            ctx.strokeStyle = '#FF9800';
            ctx.lineWidth = 4;
        } else {
            ctx.strokeStyle = '#9C27B0';
            ctx.lineWidth = 2;
        }
        
        ctx.stroke();
        
        // Draw weight with better visibility
        const midX = (fromNode.x + toNode.x) / 2;
        const midY = (fromNode.y + toNode.y) / 2;
        
        // Draw background for weight text
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(midX - 15, midY - 12, 30, 24);
        
        // Draw weight text
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(edge.weight, midX, midY);
    });
    
    // Draw nodes
    graph.nodes.forEach(node => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, 20, 0, Math.PI * 2);
        
        // Check if this node is in a cycle
        const isInCycle = animationState.cycleNodes.includes(node.id);
        const isVisited = animationState.visitedNodes.has(node.id);
        
        if (isInCycle) {
            ctx.fillStyle = '#f44336';
        } else if (isVisited) {
            ctx.fillStyle = '#4CAF50'; // Green for visited nodes
        } else {
            ctx.fillStyle = '#FF5722'; // Orange for unvisited nodes
        }
        
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw node label
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.label, node.x, node.y);
    });
    
    updateDataStructures();
    updateStats();
}

function updateAnimationControls() {
    const hasSteps = animationState.steps.length > 0;
    const isAtStart = animationState.currentStep === 0;
    const isAtEnd = animationState.currentStep === animationState.totalSteps;
    
    document.getElementById('stepBackward').disabled = !hasSteps || isAtStart || animationState.isRunning;
    document.getElementById('stepForward').disabled = !hasSteps || isAtEnd || animationState.isRunning;
    document.getElementById('pauseResume').disabled = !hasSteps;
    
    if (animationState.isRunning) {
        document.getElementById('pauseResume').textContent = 'Pause';
        document.getElementById('animationStatus').textContent = `Running (Step ${animationState.currentStep + 1}/${animationState.totalSteps})`;
    } else {
        document.getElementById('pauseResume').textContent = 'Resume';
        if (hasSteps) {
            document.getElementById('animationStatus').textContent = `Paused (Step ${animationState.currentStep}/${animationState.totalSteps})`;
        } else {
            document.getElementById('animationStatus').textContent = 'Ready to visualize';
        }
    }
    
    // Update algorithm button states
    updateAlgorithmButtons();
}

document.getElementById('reset').addEventListener('click', resetAnimation);

function resetAnimation() {
    if (animationState.intervalId) {
        clearInterval(animationState.intervalId);
        animationState.intervalId = null;
    }
    
    animationState.isRunning = false;
    animationState.currentStep = 0;
    animationState.totalSteps = 0;
    animationState.steps = [];
    animationState.algorithmLocked = false;
    
    graph.edges.forEach(edge => {
        edge.isInMST = false;
    });
    
    graph.mstEdges = [];
    
    resetAnimationState();
    updateAnimationControls();
    updateDataStructures();
    updateStats();
    drawGraph();
}

document.getElementById('visualize').addEventListener('click', startVisualization);

function startVisualization() {
    resetAnimation();
    
    const selectedAlgorithm = document.querySelector('.algorithm-btn.active').dataset.algo;
    
    if (selectedAlgorithm === 'prim') {
        primsAlgorithm();
    } else if (selectedAlgorithm === 'kruskal') {
        kruskalsAlgorithm();
    }
    
    if (animationState.steps.length > 0) {
        animationState.isRunning = true;
        animationState.totalSteps = animationState.steps.length;
        animationState.algorithmLocked = true;
        
        updateAnimationControls();
        animationState.intervalId = setInterval(animateStep, getAnimationDelay());
    }
}

function animateStep() {
    if (animationState.currentStep < animationState.totalSteps) {
        executeStep(animationState.currentStep);
        animationState.currentStep++;
        updateAnimationControls();
    } else {
        clearInterval(animationState.intervalId);
        animationState.intervalId = null;
        animationState.isRunning = false;
        animationState.algorithmLocked = false;
        
        const totalWeight = graph.mstEdges.reduce((sum, edge) => sum + edge.weight, 0);
        document.getElementById('stepInfo').innerHTML = 
            `<div class="step-highlight">Algorithm complete!</div>
             <div class="step-explanation">MST has ${graph.mstEdges.length} edges with total weight ${totalWeight}.</div>`;
        
        updateAnimationControls();
    }
}

function executeStep(stepIndex) {
    const step = animationState.steps[stepIndex];
    animationState.consideringEdge = null;
    animationState.invalidEdges = [];
    animationState.cycleEdges = [];
    animationState.cycleNodes = [];
    
    if (step.action === 'addEdge') {
        const edge = graph.edges.find(e => 
            (e.from === step.edge.from && e.to === step.edge.to) || 
            (e.from === step.edge.to && e.to === step.edge.from)
        );
        
        if (edge) {
            edge.isInMST = true;
            graph.mstEdges.push(edge);
            const edgeKey = `${Math.min(edge.from, edge.to)}-${Math.max(edge.from, edge.to)}`;
            animationState.processedEdges.add(edgeKey);
        }
    } else if (step.action === 'considerEdge') {
        animationState.consideringEdge = step.edge;
        const edgeKey = `${Math.min(step.edge.from, step.edge.to)}-${Math.max(step.edge.from, step.edge.to)}`;
        animationState.processedEdges.add(edgeKey);
    } else if (step.action === 'showInvalid') {
        animationState.invalidEdges = step.invalidEdges || [];
        if (step.cycleEdges) {
            animationState.cycleEdges = step.cycleEdges;
            animationState.cycleNodes = step.cycleNodes || [];
        }
    }
    
    if (step.priorityQueue) {
        animationState.priorityQueue = step.priorityQueue;
    }
    if (step.visitedNodes) {
        animationState.visitedNodes = new Set(step.visitedNodes);
    }
    if (step.disjointSets) {
        animationState.disjointSets = step.disjointSets;
    }
    if (step.sortedEdges) {
        animationState.sortedEdges = step.sortedEdges;
    }
    
    document.getElementById('stepInfo').innerHTML = step.description;
    drawGraph();
}

// Enhanced Prim's Algorithm with natural cycle detection
function primsAlgorithm() {
    const steps = [];
    const visited = new Set();
    const edges = [...graph.edges];
    
    visited.add(0);
    
    const priorityQueue = [];
    
    // Add edges from starting node to priority queue
    edges.forEach(edge => {
        if (edge.from === 0 || edge.to === 0) {
            priorityQueue.push({
                edge: edge,
                weight: edge.weight
            });
        }
    });
    
    priorityQueue.sort((a, b) => a.weight - b.weight);
    
    steps.push({
        action: 'message',
        description: `<div class="step-highlight">Starting Prim's algorithm from node ${graph.nodes[0].label}</div>
                     <div class="step-explanation">Initializing priority queue with edges from starting node.</div>`,
        priorityQueue: [...priorityQueue],
        visitedNodes: [...visited]
    });
    
    while (visited.size < graph.nodes.length && priorityQueue.length > 0) {
        const minEdgeItem = priorityQueue.shift();
        const minEdge = minEdgeItem.edge;
        
        const fromVisited = visited.has(minEdge.from);
        const toVisited = visited.has(minEdge.to);
        
        if ((fromVisited && !toVisited) || (!fromVisited && toVisited)) {
            const newNode = fromVisited ? minEdge.to : minEdge.from;
            
            steps.push({
                action: 'considerEdge',
                edge: minEdge,
                description: `<div class="step-highlight">Processing edge ${graph.nodes[minEdge.from].label}-${graph.nodes[minEdge.to].label} (weight: ${minEdge.weight})</div>
                             <div class="step-explanation">This is the minimum weight edge in the priority queue.</div>`,
                priorityQueue: [...priorityQueue],
                visitedNodes: [...visited]
            });
            
            steps.push({
                action: 'addEdge',
                edge: minEdge,
                description: `<div class="step-highlight">✓ Added edge ${graph.nodes[minEdge.from].label}-${graph.nodes[minEdge.to].label} to MST</div>
                             <div class="step-explanation">This edge connects a visited node to an unvisited node without forming a cycle.</div>`,
                priorityQueue: [...priorityQueue],
                visitedNodes: [...visited]
            });
            
            visited.add(newNode);
            
            // Add edges from the new node to priority queue
            edges.forEach(edge => {
                if ((edge.from === newNode && !visited.has(edge.to)) || 
                    (edge.to === newNode && !visited.has(edge.from))) {
                    priorityQueue.push({
                        edge: edge,
                        weight: edge.weight
                    });
                }
            });
            
            priorityQueue.sort((a, b) => a.weight - b.weight);
            
            steps.push({
                action: 'message',
                description: `<div class="step-highlight">Added node ${graph.nodes[newNode].label} to MST</div>
                             <div class="step-explanation">Added edges from ${graph.nodes[newNode].label} to the priority queue.</div>`,
                priorityQueue: [...priorityQueue],
                visitedNodes: [...visited]
            });
        } else {
            // This edge is invalid (would form cycle)
            const cycleInfo = findActualCycle(minEdge, visited);
            
            steps.push({
                action: 'considerEdge',
                edge: minEdge,
                description: `<div class="step-highlight">Checking edge ${graph.nodes[minEdge.from].label}-${graph.nodes[minEdge.to].label} (weight: ${minEdge.weight})</div>
                             <div class="step-explanation">This edge connects two already visited nodes.</div>`,
                priorityQueue: [...priorityQueue],
                visitedNodes: [...visited]
            });
            
            steps.push({
                action: 'showInvalid',
                edge: minEdge,
                invalidEdges: [minEdge],
                cycleEdges: cycleInfo.edges,
                cycleNodes: cycleInfo.nodes,
                description: `<div class="step-highlight">❌ Edge ${graph.nodes[minEdge.from].label}-${graph.nodes[minEdge.to].label} is INVALID</div>
                             <div class="step-explanation">This edge would form a cycle in the MST.</div>`,
                priorityQueue: [...priorityQueue],
                visitedNodes: [...visited]
            });
        }
    }
    
    animationState.steps = steps;
}

// Enhanced Kruskal's Algorithm with natural cycle detection
function kruskalsAlgorithm() {
    const steps = [];
    const edges = [...graph.edges];
    
    // Sort edges by weight
    edges.sort((a, b) => a.weight - b.weight);
    animationState.sortedEdges = [...edges];
    
    const parent = [];
    const rank = [];
    for (let i = 0; i < graph.nodes.length; i++) {
        parent[i] = i;
        rank[i] = 0;
    }
    
    function find(u) {
        if (parent[u] !== u) {
            parent[u] = find(parent[u]);
        }
        return parent[u];
    }
    
    function union(u, v) {
        const rootU = find(u);
        const rootV = find(v);
        if (rootU !== rootV) {
            if (rank[rootU] > rank[rootV]) {
                parent[rootV] = rootU;
            } else if (rank[rootU] < rank[rootV]) {
                parent[rootU] = rootV;
            } else {
                parent[rootV] = rootU;
                rank[rootU]++;
            }
            return true;
        }
        return false;
    }
    
    function getDisjointSets() {
        const sets = {};
        for (let i = 0; i < graph.nodes.length; i++) {
            const root = find(i);
            if (!sets[root]) sets[root] = [];
            sets[root].push(i);
        }
        return Object.values(sets);
    }
    
    steps.push({
        action: 'message',
        description: `<div class="step-highlight">Starting Kruskal's algorithm</div>
                     <div class="step-explanation">Sorting all edges by weight in ascending order.</div>`,
        sortedEdges: [...edges],
        disjointSets: getDisjointSets()
    });
    
    let edgesAdded = 0;
    let edgeIndex = 0;
    
    while (edgesAdded < graph.nodes.length - 1 && edgeIndex < edges.length) {
        const edge = edges[edgeIndex];
        
        steps.push({
            action: 'considerEdge',
            edge: edge,
            description: `<div class="step-highlight">Processing edge ${graph.nodes[edge.from].label}-${graph.nodes[edge.to].label} (weight: ${edge.weight})</div>
                         <div class="step-explanation">Checking if this edge can be added without forming a cycle.</div>`,
            sortedEdges: edges.slice(edgeIndex + 1),
            disjointSets: getDisjointSets()
        });
        
        const rootFrom = find(edge.from);
        const rootTo = find(edge.to);
        
        if (rootFrom !== rootTo) {
            steps.push({
                action: 'addEdge',
                edge: edge,
                description: `<div class="step-highlight">✓ Added edge ${graph.nodes[edge.from].label}-${graph.nodes[edge.to].label} to MST</div>
                             <div class="step-explanation">This edge connects two different components without forming a cycle.</div>`,
                sortedEdges: edges.slice(edgeIndex + 1),
                disjointSets: getDisjointSets()
            });
            
            union(edge.from, edge.to);
            edgesAdded++;
        } else {
            const cycleInfo = findActualCycleForKruskal(edge, parent);
            
            steps.push({
                action: 'showInvalid',
                edge: edge,
                invalidEdges: [edge],
                cycleEdges: cycleInfo.edges,
                cycleNodes: cycleInfo.nodes,
                description: `<div class="step-highlight">❌ Edge ${graph.nodes[edge.from].label}-${graph.nodes[edge.to].label} is INVALID</div>
                             <div class="step-explanation">This edge would form a cycle in the MST.</div>`,
                sortedEdges: edges.slice(edgeIndex + 1),
                disjointSets: getDisjointSets()
            });
        }
        
        edgeIndex++;
    }
    
    animationState.steps = steps;
}

// Find actual cycle using BFS
function findActualCycle(edge, visited) {
    if (!visited.has(edge.from) || !visited.has(edge.to)) {
        return { edges: [], nodes: [] };
    }
    
    const queue = [[edge.from, []]];
    const visitedNodes = new Set([edge.from]);
    let foundPath = null;
    
    while (queue.length > 0 && !foundPath) {
        const [current, path] = queue.shift();
        
        if (current === edge.to && path.length > 0) {
            foundPath = path;
            break;
        }
        
        // Explore MST edges from current node
        graph.mstEdges.forEach(mstEdge => {
            if (mstEdge.from === current && !visitedNodes.has(mstEdge.to)) {
                visitedNodes.add(mstEdge.to);
                queue.push([mstEdge.to, [...path, mstEdge]]);
            } else if (mstEdge.to === current && !visitedNodes.has(mstEdge.from)) {
                visitedNodes.add(mstEdge.from);
                queue.push([mstEdge.from, [...path, mstEdge]]);
            }
        });
    }
    
    if (foundPath) {
        return {
            edges: [edge, ...foundPath],
            nodes: Array.from(new Set([edge.from, edge.to, ...foundPath.flatMap(e => [e.from, e.to])]))
        };
    }
    
    return { edges: [], nodes: [] };
}

function findActualCycleForKruskal(edge, parent) {
    const rootFrom = findRoot(edge.from, parent);
    const rootTo = findRoot(edge.to, parent);
    
    if (rootFrom !== rootTo) {
        return { edges: [], nodes: [] };
    }
    
    // Find all MST edges in the same component that form a cycle with this edge
    const componentEdges = graph.mstEdges.filter(mstEdge => 
        findRoot(mstEdge.from, parent) === rootFrom
    );
    
    return {
        edges: [edge, ...componentEdges],
        nodes: Array.from(new Set([edge.from, edge.to, ...componentEdges.flatMap(e => [e.from, e.to])]))
    };
}

function findRoot(node, parent) {
    while (parent[node] !== node) {
        node = parent[node];
    }
    return node;
}

// Animation controls
document.getElementById('stepForward').addEventListener('click', function() {
    if (animationState.currentStep < animationState.totalSteps) {
        if (animationState.intervalId) {
            clearInterval(animationState.intervalId);
            animationState.intervalId = null;
        }
        animationState.isRunning = false;
        executeStep(animationState.currentStep);
        animationState.currentStep++;
        updateAnimationControls();
    }
});

document.getElementById('stepBackward').addEventListener('click', function() {
    if (animationState.currentStep > 0) {
        if (animationState.intervalId) {
            clearInterval(animationState.intervalId);
            animationState.intervalId = null;
        }
        animationState.isRunning = false;
        animationState.currentStep--;
        
        graph.edges.forEach(edge => {
            edge.isInMST = false;
        });
        
        graph.mstEdges = [];
        animationState.consideringEdge = null;
        animationState.invalidEdges = [];
        animationState.cycleEdges = [];
        animationState.cycleNodes = [];
        animationState.processedEdges = new Set();
        
        for (let i = 0; i < animationState.currentStep; i++) {
            const step = animationState.steps[i];
            if (step.action === 'addEdge') {
                const edge = graph.edges.find(e => 
                    (e.from === step.edge.from && e.to === step.edge.to) || 
                    (e.from === step.edge.to && e.to === step.edge.from)
                );
                
                if (edge) {
                    edge.isInMST = true;
                    graph.mstEdges.push(edge);
                    const edgeKey = `${Math.min(edge.from, edge.to)}-${Math.max(edge.from, edge.to)}`;
                    animationState.processedEdges.add(edgeKey);
                }
            } else if (step.action === 'considerEdge' && step.edge) {
                const edgeKey = `${Math.min(step.edge.from, step.edge.to)}-${Math.max(step.edge.from, step.edge.to)}`;
                animationState.processedEdges.add(edgeKey);
            }
        }
        
        if (animationState.currentStep > 0) {
            const step = animationState.steps[animationState.currentStep - 1];
            if (step.priorityQueue) animationState.priorityQueue = step.priorityQueue;
            if (step.visitedNodes) animationState.visitedNodes = new Set(step.visitedNodes);
            if (step.disjointSets) animationState.disjointSets = step.disjointSets;
            if (step.sortedEdges) animationState.sortedEdges = step.sortedEdges;
            
            document.getElementById('stepInfo').innerHTML = step.description;
        } else {
            document.getElementById('stepInfo').textContent = 'Click "Visualize" to start the algorithm visualization.';
            animationState.priorityQueue = [];
            animationState.visitedNodes = new Set();
            animationState.disjointSets = [];
            animationState.sortedEdges = null;
        }
        
        updateAnimationControls();
        drawGraph();
    }
});

document.getElementById('pauseResume').addEventListener('click', function() {
    if (animationState.isRunning) {
        clearInterval(animationState.intervalId);
        animationState.intervalId = null;
        animationState.isRunning = false;
    } else {
        if (animationState.currentStep < animationState.totalSteps) {
            animationState.isRunning = true;
            animationState.intervalId = setInterval(animateStep, getAnimationDelay());
        }
    }
    updateAnimationControls();
});

// Node dragging functionality
canvas.addEventListener('mousedown', handleMouseDown);
canvas.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('mouseup', handleMouseUp);
canvas.addEventListener('mouseleave', handleMouseUp);

function handleMouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Check if clicked on a node
    for (let i = 0; i < graph.nodes.length; i++) {
        const node = graph.nodes[i];
        const dx = node.x - x;
        const dy = node.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance <= 20) {
            animationState.draggingNode = node;
            animationState.dragOffset.x = x - node.x;
            animationState.dragOffset.y = y - node.y;
            break;
        }
    }
}

function handleMouseMove(e) {
    if (animationState.draggingNode) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        animationState.draggingNode.x = x - animationState.dragOffset.x;
        animationState.draggingNode.y = y - animationState.dragOffset.y;
        
        drawGraph();
    }
}

function handleMouseUp() {
    animationState.draggingNode = null;
}

generateGraph();