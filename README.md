# EXPIREMENTAL: Compile ts on save

This plugin is just a quick draft, and experimental. Don't use it for now until I find time to implement it properly.

Feel free to follow for updates!

## What it does

When you save it will loop back in your project structure to find a tsconfig and run `tsc` on that location which will be the first tsconfig it finds from your current working file up to your root folder.

This can also be done manually using the `build` command.