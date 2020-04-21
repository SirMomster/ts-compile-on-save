# EXPIREMENTAL: Compile TS on save

This plugin allows you to compile ts on save using existing configuration.

Feel free to follow for updates!

## How does it work

When you save it will loop back in your project structure to find a tsconfig and run `tsc` on that location which will be the first tsconfig it finds from your current working file up to your root folder.

This is ideal when working with a project that uses `yarn workspaces` or `lerna`. Especially when you use multiple modules that depend on each other and have frequent changes.

You can also manually trigger it by using the build command.

## How to configure

By default the plugin is `disabled` to get it working you must configure 2 things:

### 1. make sure you have a workspace!

This plugin requires that you use a workspace to a `.vscode` folder with a `settings.json` is a must.

### 2. Contents of the settings.json

```json
{
    "tsCompileOnSave.enabled": true, # to enable the plugin
    "tsCompileOnSave.prefixes": [ # add glob patterns for you packages
        "packages/lib/**/src/**"
    ]
}

```

That's it happy coding!