**Creating A Next.js Project**
- npx create-next-app@latest database-management-app -ts
- cd database-management-app
- mkdir src
- git mv app src/
- git mv components src/    # if you have one
- git mv styles src/        # or move globals.css into src/app


**Making an App using**
- npm install --save-dev electron electron-build (MIGHT BE DEPRICATED WHEN INSTALLED)

**DO THIS WHEN THE INSTALLED ELECTRON IS DEPRICATED**
- npm uninstall electron-build
- npm install --save-dev electron-builder concurrently wait-on
- npm audit fix

**MAKING THE PROJECT PUSH INTO GITHUB**
- git remote add origin https://github.com/johntest811/-Faragon-_DatabaseManagementSystem-
- git branch -M main
- git push -u origin main
- gh auth login
- gh auth login        
# one-time if not logged in
- gh repo create database-management-app --public --source=. --remote=origin --push
- git branch -M main
- git push -u origin main

- git init
- git add .
- git commit - "Initial commit"

**If Not Loggedin**
- gh auth login        
# one-time if not logged in
- gh repo create database-management-app --public --source=. --remote=origin --push


npm view @electron/rebuild@3.7.2 engines
npm view electron-builder@26.4.0 dependencies --json
npm ls @electron/rebuild

**SUPABASE MIGRATION NOTE (TEMPLATE PERMISSION KEY RENAME)**
- Run `supabase_migrate_download_template_to_export_template.sql` in Supabase SQL Editor.
- This remaps legacy `download_template` to `export_template` in:
	- `admin_column_access_overrides`
	- `user_column_access_overrides`
	- `access_requests.requested_column_key`





	How to Fix It (1-Minute Fix)
Locate latest.yml on your computer: Open your local project directory: 📂 c:\Users\JOHN\Music\Faragon\DatabaseManagement\dist\ You will see a file named latest.yml.

Upload latest.yml to your GitHub Release:

Go to your GitHub Release page (Faragon Database 0.1.2).
Click the Edit release button (the pencil icon ✏️ at the top right of the release box).
Drag and drop latest.yml from your dist/ folder into the Attach binaries... box alongside Faragon.Database.Setup.0.1.2.exe.
Click Update release (or Save).


Faragon.Database.Setup.0.1.3.exe
upload the latest.yml also
Bump version in package.json to "0.1.2".
