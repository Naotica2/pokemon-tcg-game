import Phaser from 'phaser';
import CollectionScene from './scenes/CollectionScene';
import PackOpeningScene from './scenes/PackOpeningScene';
import BattleScene from './scenes/BattleScene';
import PreloadScene from './scenes/PreloadScene';
import HomeScene from './scenes/HomeScene';

import MarketplaceScene from './scenes/MarketplaceScene';

import ProfileScene from './scenes/ProfileScene';
import AuthScene from './scenes/AuthScene';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: '100%',
    height: '100%',
    backgroundColor: '#1a1a1a', // Dark modern background
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [
        PreloadScene,
        AuthScene,
        HomeScene,
        ProfileScene,
        PackOpeningScene,
        CollectionScene,
        MarketplaceScene,
        BattleScene
    ],
    parent: 'app',
    dom: {
        createContainer: true
    }
};

const game = new Phaser.Game(config);

// Debug helper
(window as any).game = game;
