require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

let apiCallCount = 0;

// Track all outgoing Steam API calls
axios.interceptors.request.use((config) => {
    if (config.url && config.url.includes('steampowered.com')) {
        apiCallCount++;
        console.log(`[Steam API Tracker] Outbound Request... Total today (since boot): ${apiCallCount} / 100,000`);
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Resolve Vanity URL to 64-bit Steam ID
app.get('/api/resolve/:vanity', async (req, res) => {
    try {
        const { vanity } = req.params;
        const url = `http://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${process.env.STEAM_API_KEY}&vanityurl=${encodeURIComponent(vanity)}`;
        const response = await axios.get(url);
        if (response.data.response.success === 1) {
            res.json({ steamid: response.data.response.steamid });
        } else {
            res.status(404).json({ error: 'Vanity URL not found' });
        }
    } catch (error) {
        console.error('Error resolving vanity URL:', error.message);
        res.status(500).json({ error: 'Failed to resolve Vanity URL' });
    }
});

// Fetch Steam Level
app.get('/api/level/:steamId', async (req, res) => {
    try {
        const { steamId } = req.params;
        const url = `http://api.steampowered.com/IPlayerService/GetSteamLevel/v1/?key=${process.env.STEAM_API_KEY}&steamid=${steamId}`;
        const response = await axios.get(url);
        res.json({ player_level: response.data.response.player_level });
    } catch (error) {
        res.json({ player_level: '?' }); // Probably private or rate limited
    }
});

// Fetch Owned Games
app.get('/api/owns/:steamId', async (req, res) => {
    try {
        const { steamId } = req.params;
        const url = `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${process.env.STEAM_API_KEY}&steamid=${steamId}&include_appinfo=1`;
        const response = await axios.get(url);
        res.json({ games: response.data.response.games || [] });
    } catch (error) {
        res.json({ games: [] }); // Private profile or error
    }
});

// Search Steam Store for Game Names
app.get('/api/search/:term', async (req, res) => {
    try {
        const { term } = req.params;
        const url = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=US`;
        const response = await axios.get(url);
        
        let games = [];
        if (response.data && response.data.items) {
             games = response.data.items.slice(0, 5).map(item => item.name);
        }
        res.json({ games });
    } catch (error) {
        console.error('Error searching games:', error.message);
        res.json({ games: [] });
    }
});

// Fetch User Summary (Avatar, Name, etc.)
app.get('/api/user/:steamId', async (req, res) => {
    try {
        const { steamId } = req.params;
        const url = `http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${process.env.STEAM_API_KEY}&steamids=${steamId}`;
        const response = await axios.get(url);
        res.json(response.data.response.players[0] || {});
    } catch (error) {
        console.error('Error fetching user summary:', error.message);
        res.status(500).json({ error: 'Failed to fetch user summary' });
    }
});

// Fetch Top-Level Friends
app.get('/api/friends/:steamId', async (req, res) => {
    try {
        const { steamId } = req.params;
        const url = `http://api.steampowered.com/ISteamUser/GetFriendList/v0001/?key=${process.env.STEAM_API_KEY}&steamid=${steamId}&relationship=friend`;
        const response = await axios.get(url);
        
        // Steam friends list doesn't include avatars/names natively, just steamids.
        // We need to fetch details for them in a batched call.
        const friendsList = response.data.friendslist.friends || [];
        const friendIds = friendsList.map(friend => friend.steamid);

        if (friendIds.length === 0) {
             return res.json([]);
        }
        
        // Batch request summaries for friends. Steam allows 100 steamids per request.
        // For simplicity with this MVP, we will chunk them in 100s if needed.
        const chunks = [];
        for (let i = 0; i < friendIds.length; i += 100) {
            chunks.push(friendIds.slice(i, i + 100).join(','));
        }

        let allFriendsProfiles = [];
        for (const chunk of chunks) {
            const summaryUrl = `http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${process.env.STEAM_API_KEY}&steamids=${chunk}`;
            const summaryRes = await axios.get(summaryUrl);
            allFriendsProfiles = allFriendsProfiles.concat(summaryRes.data.response.players);
        }

        res.json(allFriendsProfiles);
    } catch (error) {
        console.error('Error fetching friends list:', error.message);
        res.status(500).json({ error: 'Failed to fetch friends list or private profile' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
