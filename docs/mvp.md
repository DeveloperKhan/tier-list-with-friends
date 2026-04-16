# Name: Tier Lists with Friends

Simple collaborative workspace in Discord activities for friends to build and save a tier list together.

# Setup

The host starts a game. If the host leaves, a new host will be randomly selected.

The host has the following setup options:

- Tier title
- Images (upload)
- Tiers (default: A, B, C, D, F)

The host can load up an existing TierMaker template. There will be a popup to browse tiermaker.com and pick out a template.

This popup will use the tiermaker search query (https://tiermaker.com/search/?q={insert_value_here}) to get results.

# Building a tier list

## Adding items to the tier list

Once the game has started, all players will be able to drag the images from the bottom and add them to the tier list. The images will snap to place.

Only one player can move around a item at a time. If a user clicks on an item that another player is interacting with, they'll get a warning that it's already in use.

Once a player drops an item into the tier list, that item is locked to other players. Only the original player can interact with that item again. The lock goes away if the item is returned to the image bank under the tier list.

## Loading new images

All players can upload more images to the image bank from their device. The images will have data size constraints so that 100 items could be added to the bank if needed.

## Saving the tier list

After the tier list is created, the host can choose to save the image. It will take a snapshot of the tier list and export it as a link.

## Editing tiers

The host can add, delete, reorder, and rename tiers.

# Limitations

There should be no external database. All of the images and code should live in this app server.

Up to 30 players can play.

Up to 100 images can be saved.

If everyone leaves, or the host decides to make a new tier list (restarting the process), then none of the data is saved.

