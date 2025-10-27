# Credits

This Obsidian dice plugin was built with inspiration and assistance from several excellent open-source projects:

## Primary Inspirations

### [dice-box](https://github.com/3d-dice/dice-box)
The core inspiration for this plugin's architecture, physics implementation, and general dice mechanics. This project provided invaluable guidance for:
- THREE.js 3D dice rendering
- CANNON.js physics integration
- Dice geometry and UV mapping approaches
- Overall plugin structure and design patterns

### [react-3d-dice](https://github.com/aqandrew/react-3d-dice)
Specifically helped with the D10 (decahedron) implementation. This repository provided:
- D10 geometry vertex and face data
- Proper D10 kite-shaped face mapping
- Mathematical foundations for D10 UV coordinates

## Acknowledgments

Special thanks to the maintainers and contributors of these projects for making their work available under open-source licenses. Their code, documentation, and approaches were instrumental in creating a robust 3D dice system for Obsidian.

## Technologies Used

- **THREE.js** - 3D rendering and geometry
- **CANNON.js** - Physics simulation
- **Obsidian API** - Plugin integration
- **TypeScript** - Type-safe development
- **Canvas API** - UV template generation

## License

This plugin builds upon the work of others while adding unique features for Obsidian integration. Please refer to the individual repositories above for their respective licenses and terms.