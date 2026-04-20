document.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('search-btn');
    const steamInput = document.getElementById('steam-id');
    const panel = document.getElementById('profile-panel');
    const closePanel = document.getElementById('close-panel');

    let cy;

    const initCytoscape = () => {
        cy = cytoscape({
            container: document.getElementById('cy'),
            elements: [],
            style: [
                {
                    selector: 'node',
                    style: {
                        'background-color': '#66c0f4',
                        'label': 'data(id)',
                        'color': '#fff',
                        'text-outline-color': '#1b2838',
                        'text-outline-width': 2,
                        'text-valign': 'bottom',
                        'text-margin-y': 5,
                        'font-size': '12px',
                        'width': 50,
                        'height': 50,
                        'background-fit': 'cover',
                        'background-clip': 'node',
                        'border-width': 2,
                        'border-color': '#2a475e'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 2,
                        'line-color': '#3c4f6b',
                        'curve-style': 'bezier',
                        'opacity': 0.6
                    }
                },
                {
                    selector: '.selected',
                    style: {
                        'border-color': '#ffdf00',
                        'border-width': 4
                    }
                },
                {
                    selector: 'edge.highlighted',
                    style: {
                        'line-color': '#90ee90',
                        'opacity': 1,
                        'width': 4,
                        'z-index': 10
                    }
                },
                {
                    selector: 'node.highlighted',
                    style: {
                        'border-color': '#90ee90',
                        'border-width': 4
                    }
                }
            ],
            layout: { name: 'cose', animate: true }
        });

        setupClickEvents();
    };

    const fetchUser = async (steamId) => {
        try {
            const res = await fetch(`/api/user/${steamId}`);
            if (!res.ok) throw new Error('Network response was not ok');
            const data = await res.json();
            return data;
        } catch (error) {
            console.error('Failed to fetch user:', error);
        }
    };

    const fetchFriends = async (steamId) => {
        try {
            const res = await fetch(`/api/friends/${steamId}`);
            if (!res.ok) throw new Error('Friends response not ok or profile is private');
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch (error) {
            console.error('Failed to fetch friends:', error);
            return [];
        }
    };

    const mapFriendsNetwork = async (rootSteamId) => {
        // Fetch root user
        const rootUser = await fetchUser(rootSteamId);
        if (!rootUser || !rootUser.steamid) {
            alert("Could not find user. Make sure it's a valid 64-bit Steam ID.");
            return;
        }

        // Initialize cytoscape if empty
        if (!cy) initCytoscape();

        // Clear existing map when searching a new root user manually via the bar
        if (steamInput.value === rootSteamId) {
             cy.elements().remove();
        }

        addNodeToGraph(rootUser);
        await expandFriends(rootUser.steamid);
        
        applyLayout();
    };

    const expandFriends = async (sourceId) => {
        const friends = await fetchFriends(sourceId);
        if (friends.length === 0) {
            console.log(`No friends found or profile is private for ${sourceId}`);
            return;
        }

        const elements = [];

        friends.forEach(friend => {
            if (!cy.getElementById(friend.steamid).length) {
                // Add friend node
                elements.push({
                    group: 'nodes',
                    data: {
                        id: friend.steamid,
                        label: friend.personaname || friend.steamid,
                        avatar: friend.avatarfull,
                        profileUrl: friend.profileurl,
                        status: getStatusText(friend.personastate)
                    }
                });
            }

            // Create edge if it doesn't already exist
            const edgeId = sourceId < friend.steamid ? `${sourceId}-${friend.steamid}` : `${friend.steamid}-${sourceId}`;
            if (!cy.getElementById(edgeId).length) {
                elements.push({
                    group: 'edges',
                    data: {
                        id: edgeId,
                        source: sourceId,
                        target: friend.steamid
                    }
                });
            }
        });

        cy.add(elements);
        
        // Update cytoscape node backgrounds
        cy.nodes().forEach(node => {
            const avatar = node.data('avatar');
            if (avatar) {
                node.style('background-image', avatar);
                node.style('label', node.data('label'));
            }
        });
    };

    const addNodeToGraph = (user) => {
        if (!cy.getElementById(user.steamid).length) {
            cy.add({
                group: 'nodes',
                data: {
                    id: user.steamid,
                    label: user.personaname,
                    avatar: user.avatarfull,
                    profileUrl: user.profileurl,
                    status: getStatusText(user.personastate)
                }
            });

            // Set background specifically
            const n = cy.getElementById(user.steamid);
            n.style('background-image', user.avatarfull);
            n.style('label', user.personaname);
        }
    };

    const applyLayout = () => {
        const layout = cy.layout({
            name: 'cose',
            idealEdgeLength: 100,
            nodeOverlap: 20,
            refresh: 20,
            fit: true,
            padding: 30,
            randomize: false,
            componentSpacing: 100,
            nodeRepulsion: 400000,
            edgeElasticity: 100,
            nestingFactor: 5,
            animate: true
        });
        layout.run();
    };

    const setupClickEvents = () => {
        let doubleClickTimer = null;

        // Deselect when clicking empty space (background)
        cy.on('tap', (evt) => {
            if (evt.target === cy) {
                cy.elements().removeClass('selected highlighted');
                panel.classList.add('hidden');
            }
        });

        cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            const steamId = node.id();

            if (doubleClickTimer) {
                clearTimeout(doubleClickTimer);
                doubleClickTimer = null;
                // Double Click Logic
                handleDoubleClick(steamId);
            } else {
                doubleClickTimer = setTimeout(() => {
                    doubleClickTimer = null;
                    // Single Click Logic
                    handleSingleClick(node, evt);
                }, 250); // 250ms threshold for single vs double click
            }
        });
    };

    const handleSingleClick = (node, evt) => {
        const isShift = evt && evt.originalEvent && evt.originalEvent.shiftKey;

        if (!isShift) {
            // Clear existing visual highlights if NOT shift-clicking
            cy.elements().removeClass('selected').removeClass('highlighted');
            node.addClass('selected');
        } else {
            // Toggle selection for shift-click
            if (node.hasClass('selected')) {
                node.removeClass('selected');
            } else {
                node.addClass('selected');
            }
        }

        updateHighlights();
    };

    const updateHighlights = () => {
        // Clear all highlighted edges and secondary nodes
        cy.elements().removeClass('highlighted');

        const selectedNodes = cy.nodes('.selected');

        if (selectedNodes.length === 0) {
            panel.classList.add('hidden');
            return;
        }

        if (selectedNodes.length === 1) {
            const node = selectedNodes[0];
            // Apply highlights for the current node and its neighborhood
            node.connectedEdges().addClass('highlighted');
            node.neighborhood('node').addClass('highlighted');

            // Show the info panel
            panel.classList.remove('hidden');
            document.getElementById('panel-name').textContent = node.data('label') || 'Unknown';
            document.getElementById('panel-avatar').src = node.data('avatar') || '';
            document.getElementById('panel-status').textContent = `Status: ${node.data('status') || 'Offline'}`;
            document.getElementById('panel-link').href = node.data('profileUrl') || '#';
        } else {
            // Multiple nodes selected
            panel.classList.add('hidden'); // Hide info box

            let commonNeighbors = null;

            // Find intersection of neighbors
            selectedNodes.forEach(node => {
                const neighbors = node.neighborhood('node');
                if (!commonNeighbors) {
                    commonNeighbors = neighbors;
                } else {
                    commonNeighbors = commonNeighbors.intersection(neighbors);
                }
            });

            // Highlight the mutual friends and their connections to the selected nodes
            if (commonNeighbors && commonNeighbors.length > 0) {
                commonNeighbors.addClass('highlighted');

                selectedNodes.forEach(selectedNode => {
                    const mutuallyConnectedEdges = selectedNode.connectedEdges().intersection(commonNeighbors.connectedEdges());
                    mutuallyConnectedEdges.addClass('highlighted');
                });
            }
        }
    };

    const handleDoubleClick = async (steamId) => {
        // Expand network and re-layout
        await expandFriends(steamId);
        applyLayout();
    };

    // Helper functions
    const getStatusText = (state) => {
        const states = ["Offline", "Online", "Busy", "Away", "Snooze", "Looking to Trade", "Looking to Play"];
        return states[state] || "Unknown";
    };

    closePanel.addEventListener('click', () => {
        panel.classList.add('hidden');
    });

    steamInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            searchBtn.click();
        }
    });

    searchBtn.addEventListener('click', () => {
        const query = steamInput.value.trim();
        if (query) {
            mapFriendsNetwork(query);
            panel.classList.add('hidden'); // Close panel on new search
        }
    });

    initCytoscape();
});
