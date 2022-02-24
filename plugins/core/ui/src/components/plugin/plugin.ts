import { SystemManager } from '@scrypted/types';
import axios from 'axios';
import semver from 'semver';

import { getComponentWebPath } from "../helpers";
const componentPath = getComponentWebPath('script');

export interface PluginUpdateCheck {
    updateAvailable?: string;
    versions: any;
}

export async function checkUpdate(npmPackage: string, npmPackageVersion: string): Promise<PluginUpdateCheck> {
    // const response = await axios.get(`${componentPath}/npm/${npmPackage}`);
    // registry.npmjs.org does not support CORS on the package endpoints.
    // open issue:
    // https://github.com/npm/feedback/discussions/117
    // npmjs.cf is an unofficial CDN that provides it
    const response = await axios.get(`https://registry.npmjs.cf/${npmPackage}`);
    const { data } = response;
    const versions = Object.values(data.versions).sort((a: any, b: any) => semver.compare(a.version, b.version)).reverse();
    let updateAvailable: any;
    let latest: any;
    if (data["dist-tags"]) {
        latest = data["dist-tags"].latest;
        if (npmPackageVersion && semver.gt(latest, npmPackageVersion)) {
            updateAvailable = latest;
        }
    }
    for (const [k, v] of Object.entries(data['dist-tags'])) {
        const found: any = versions.find((version: any) => version.version === v);
        if (found) {
            found.tag = k;
        }
    }
    const current: any = versions.find((version: any) => version.version === npmPackageVersion);
    if (current) {
        current.tag = 'installed';
    }
    // make sure latest build is first instead of a beta.
    if (latest) {
        const index = versions.findIndex((v: any) => v.version === latest);
        const [spliced] = versions.splice(index, 1);
        versions.unshift(spliced);
    }
    return {
        updateAvailable,
        versions,
    };
}

export function installNpm(systemManager: SystemManager, npmPackage: string, version?: string, installedSet?: Set<string>): Promise<string> {
    if (!installedSet)
        installedSet = new Set();
    if (installedSet.has(npmPackage))
        return;
    installedSet.add(npmPackage);
    let suffix = version ? `/${version}` : '';
    const scryptedId = axios.post(
        `${componentPath}/install/${npmPackage}${suffix}`
    ).then(response => response.data.id);

    scryptedId.then(async (id) => {
        const plugins = await systemManager.getComponent('plugins');
        const packageJson = await plugins.getPackageJson(npmPackage);
        for (const dep of packageJson.scrypted.pluginDependencies || []) {
            try {
                const depId = await plugins.getIdForPluginId(dep);
                if (depId)
                    throw new Error('Plugin already installed.');
                installNpm(systemManager, dep, undefined, installedSet);
            }
            catch (e) {
                console.log('Skipping', dep, ':', e.message);
            }
        }
    });

    return scryptedId;
}

export function getNpmPath(npmPackage) {
    return `https://www.npmjs.com/package/${npmPackage}`;
}
