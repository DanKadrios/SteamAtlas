document.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('search-btn');
    const steamInput = document.getElementById('steam-id');
    const gameFilter = document.getElementById('game-filter');
    const filterBtn = document.getElementById('filter-btn');
    const autocompleteDropdown = document.getElementById('autocomplete-dropdown');
    const localSearch = document.getElementById('local-search');
    const graphMode = document.getElementById('graph-mode');
    const panel = document.getElementById('profile-panel');
    const closePanel = document.getElementById('close-panel');
    const changelogBtn = document.getElementById('changelog-btn');
    const changelogModal = document.getElementById('changelog-modal');
    const closeChangelog = document.getElementById('close-changelog');

    const toggleLeftBtn = document.getElementById('toggle-left');
    const searchContent = document.getElementById('search-content');
    const toggleRightBtn = document.getElementById('toggle-right');
    const viewContent = document.getElementById('view-content');

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
                },
                {
                    selector: 'node.dimmed',
                    style: {
                        'opacity': 0.1,
                        'border-width': 0
                    }
                },
                {
                    selector: 'edge.dimmed',
                    style: {
                        'opacity': 0.05
                    }
                },
                {
                    selector: 'edge.hidden-edge',
                    style: {
                        'display': 'none'
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

    const mapFriendsNetwork = async (queryId) => {
        let rootSteamId = queryId;

        // Check if query is a vanity URL instead of a 64-bit ID
        if (!/^\d{17}$/.test(queryId)) {
            try {
                const res = await fetch(`/api/resolve/${encodeURIComponent(queryId)}`);
                const data = await res.json();
                if (data.steamid) {
                    rootSteamId = data.steamid;
                } else {
                    alert("Could not resolve Vanity URL to a Steam64 ID.");
                    return;
                }
            } catch (err) {
                alert("Error resolving Vanity URL.");
                return;
            }
        }

        // Fetch root user
        const rootUser = await fetchUser(rootSteamId);
        if (!rootUser || !rootUser.steamid) {
            alert("Could not find user.");
            return;
        }

        // Initialize cytoscape if empty
        if (!cy) initCytoscape();

        // Clear existing map when searching a new root user manually via the bar
        if (steamInput.value === queryId) {
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
                        status: getStatusText(friend.personastate),
                        game: friend.gameextrainfo || '',
                        timecreated: friend.timecreated || 0
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
                    status: getStatusText(user.personastate),
                    game: user.gameextrainfo || '',
                    timecreated: user.timecreated || 0
                }
            });

            // Set background specifically
            const n = cy.getElementById(user.steamid);
            n.style('background-image', user.avatarfull);
            n.style('label', user.personaname);
        }
    };

    const fetchLevels = async () => {
        const promises = [];
        cy.nodes().forEach(node => {
            const id = node.id();
            if (node.data('level') === undefined) {
                promises.push(
                    fetch(`/api/level/${id}`).then(r => r.json())
                    .then(d => { node.data('level', d.player_level !== undefined ? d.player_level : -1); })
                    .catch(() => { node.data('level', -1); })
                );
            }
        });
        await Promise.all(promises);
    };

    const fetchGamesData = async () => {
        const promises = [];
        cy.nodes().forEach(node => {
            const id = node.id();
            if (node.data('playtime') === undefined) {
                let p;
                if (gamesCache.has(id)) {
                    p = Promise.resolve(gamesCache.get(id));
                } else {
                    p = fetch(`/api/owns/${id}`).then(r => r.json())
                    .then(d => {
                        const games = d.games || [];
                        gamesCache.set(id, games);
                        return games;
                    }).catch(() => []);
                }
                promises.push(p.then(games => {
                    node.data('library', games.length);
                    const totalMins = games.reduce((acc, g) => acc + (g.playtime_forever || 0), 0);
                    node.data('playtime', Math.round(totalMins / 60));
                }));
            }
        });
        await Promise.all(promises);
    };

    const setNodeSizes = (mode) => {
        if (mode === 'popularity') {
            let maxDeg = 1;
            cy.nodes().forEach(node => {
                const deg = node.degree(false);
                if (deg > maxDeg) maxDeg = deg;
                node.data('popularity', deg);
            });
            cy.nodes().forEach(node => {
                const pop = node.data('popularity');
                const size = 40 + ((pop / maxDeg) * 80); // Scale from 40 to 120
                node.style('width', size);
                node.style('height', size);
            });
        } else {
            cy.nodes().forEach(node => {
                node.style('width', '');
                node.style('height', '');
            });
        }
    };

    const applyRankedLayout = (statField, higherIsBetter) => {
        cy.edges().addClass('hidden-edge');
        
        const validNodes = [];
        const invalidNodes = [];
        
        cy.nodes().forEach(node => {
            const val = node.data(statField);
            if (val !== undefined && val > 0) validNodes.push({ id: node.id(), val: val });
            else invalidNodes.push(node.id());
        });

        if (higherIsBetter) {
            validNodes.sort((a, b) => b.val - a.val); // Descending (Highest first)
        } else {
            validNodes.sort((a, b) => a.val - b.val); // Ascending (Oldest timestamp first)
        }

        let headVal = 0, tailVal = 1, valRange = 1;
        if (validNodes.length > 0) {
            headVal = validNodes[0].val;
            tailVal = validNodes[validNodes.length - 1].val;
            valRange = Math.abs(headVal - tailVal) || 1;
        }

        const graphHeight = 800;
        const xSpacing = 100;

        const layout = cy.layout({
            name: 'preset',
            animate: true,
            fit: true,
            padding: 50,
            positions: (node) => {
                const id = node.id();
                const val = node.data(statField);
                
                if (val === undefined || val <= 0) {
                    const idx = invalidNodes.indexOf(id);
                    return { x: (idx + 1) * xSpacing, y: graphHeight + 200 };
                } else {
                    const idx = validNodes.findIndex(n => n.id === id);
                    const rank = idx + 1; 
                    const yPos = (Math.abs(val - headVal) / valRange) * graphHeight;
                    return { x: rank * xSpacing, y: yPos };
                }
            }
        });
        layout.run();
    };

    const applyLayout = async () => {
        if (!graphMode) return;
        const mode = graphMode.value;
        const prevText = graphMode.options[graphMode.selectedIndex].text;
        graphMode.disabled = true;
        graphMode.options[graphMode.selectedIndex].text = "Loading...";

        try {
            setNodeSizes(mode);

            if (mode === 'level') {
                await fetchLevels();
                applyRankedLayout('level', true);
            } else if (mode === 'playtime') {
                await fetchGamesData();
                applyRankedLayout('playtime', true);
            } else if (mode === 'library') {
                await fetchGamesData();
                applyRankedLayout('library', true);
            } else if (mode === 'age') {
                applyRankedLayout('timecreated', false);
            } else {
                cy.edges().removeClass('hidden-edge');
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
            }
        } catch (err) {
            console.error(err);
        } finally {
            graphMode.options[graphMode.selectedIndex].text = prevText;
            graphMode.disabled = false;
        }
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

            const game = node.data('game');
            const gameEl = document.getElementById('panel-game');
            if (game) {
                gameEl.textContent = `Playing: ${game}`;
                gameEl.classList.remove('hidden');
            } else {
                gameEl.classList.add('hidden');
            }

            const tc = node.data('timecreated');
            let ageStr = "Private/Unknown";
            if (tc) {
                const date = new Date(tc * 1000);
                ageStr = date.toLocaleDateString();
            }
            document.getElementById('panel-age').textContent = `Created: ${ageStr}`;

            document.getElementById('panel-level').textContent = 'Level: Loading...';
            // Fetch level async
            fetch(`/api/level/${node.id()}`).then(r => r.json())
                .then(data => {
                    // Make sure the node is still selected when the fetch completes
                    if (node.hasClass('selected')) {
                        document.getElementById('panel-level').textContent = `Level: ${data.player_level !== undefined ? data.player_level : '?'}`;
                    }
                })
                .catch(e => {
                    document.getElementById('panel-level').textContent = 'Level: ?';
                });

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

    const gamesCache = new Map();

    const checkGameOwnership = async (steamId, query) => {
        let games = [];
        if (gamesCache.has(steamId)) {
            games = gamesCache.get(steamId);
        } else {
            try {
                const res = await fetch(`/api/owns/${steamId}`);
                const data = await res.json();
                games = data.games || [];
                gamesCache.set(steamId, games);
            } catch (err) {
                games = [];
                gamesCache.set(steamId, games);
            }
        }
        
        return games.some(g => g.name && g.name.toLowerCase().includes(query));
    };

    if (filterBtn && gameFilter) {
        let debounceTimer;
        
        gameFilter.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (!query) {
                autocompleteDropdown.innerHTML = '';
                autocompleteDropdown.classList.add('hidden');
                return;
            }

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                try {
                    const res = await fetch(`/api/search/${encodeURIComponent(query)}`);
                    const data = await res.json();
                    
                    if (data.games && data.games.length > 0) {
                        autocompleteDropdown.innerHTML = '';
                        data.games.forEach(gameName => {
                            const div = document.createElement('div');
                            div.className = 'autocomplete-item';
                            div.textContent = gameName;
                            div.addEventListener('click', () => {
                                gameFilter.value = gameName;
                                autocompleteDropdown.classList.add('hidden');
                                filterBtn.click(); // Auto-filter on click
                            });
                            autocompleteDropdown.appendChild(div);
                        });
                        autocompleteDropdown.classList.remove('hidden');
                    } else {
                        autocompleteDropdown.classList.add('hidden');
                    }
                } catch (err) {
                    console.error('Error fetching autocomplete games:', err);
                }
            }, 300); // 300ms debounce
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (e.target !== gameFilter && e.target !== autocompleteDropdown) {
                autocompleteDropdown.classList.add('hidden');
            }
        });

        gameFilter.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                autocompleteDropdown.classList.add('hidden');
                filterBtn.click();
            }
        });

        filterBtn.addEventListener('click', async () => {
            const query = gameFilter.value.toLowerCase().trim();
            cy.elements().removeClass('dimmed');
            
            if (!query) return;

            const nodes = cy.nodes();
            
            // Show a small UI indication if desired, or just wait (fetch might take a moment if not cached)
            const oldText = filterBtn.innerText;
            filterBtn.innerText = 'Filtering...';
            filterBtn.disabled = true;

            const ownershipChecks = await Promise.allSettled(
                nodes.map(node => 
                    checkGameOwnership(node.id(), query).then(owns => ({
                        node,
                        owns
                    }))
                )
            );

            const nonMatches = [];
            ownershipChecks.forEach(result => {
                if (result.status === 'fulfilled' && !result.value.owns) {
                    nonMatches.push(result.value.node);
                }
            });

            const nonMatchesCollection = cy.collection(nonMatches);
            nonMatchesCollection.addClass('dimmed');
            nonMatchesCollection.connectedEdges().addClass('dimmed');

            filterBtn.innerText = oldText;
            filterBtn.disabled = false;
        });
    }

    if (changelogBtn && changelogModal) {
        changelogBtn.addEventListener('click', () => {
            changelogModal.classList.remove('hidden');
        });
    }

    if (closeChangelog && changelogModal) {
        closeChangelog.addEventListener('click', () => {
            changelogModal.classList.add('hidden');
        });
    }

    if (localSearch) {
        localSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            cy.elements().removeClass('dimmed');
            
            if (query) {
                const nonMatches = cy.nodes().filter(node => {
                    const label = (node.data('label') || '').toLowerCase();
                    const id = (node.data('id') || '').toLowerCase();
                    return !label.includes(query) && !id.includes(query);
                });
                
                // Dim non-matching nodes and edges
                nonMatches.addClass('dimmed');
                nonMatches.connectedEdges().addClass('dimmed');
            }
        });
    }

    if (toggleLeftBtn && searchContent) {
        toggleLeftBtn.addEventListener('click', () => {
            searchContent.classList.toggle('hidden');
            toggleLeftBtn.textContent = searchContent.classList.contains('hidden') ? '▲' : '▼';
        });
    }

    if (toggleRightBtn && viewContent) {
        toggleRightBtn.addEventListener('click', () => {
            viewContent.classList.toggle('hidden');
            toggleRightBtn.textContent = viewContent.classList.contains('hidden') ? '▲' : '▼';
        });
    }

    if (graphMode) {
        graphMode.addEventListener('change', () => {
            applyLayout();
        });
    }

    initCytoscape();
});
