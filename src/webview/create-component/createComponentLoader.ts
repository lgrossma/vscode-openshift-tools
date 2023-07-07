/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { Uri, ViewColumn, WebviewPanel, extensions, window } from 'vscode';
import * as YAML from 'yaml';
import { OdoImpl } from '../../odo';
import { AnalyzeResponse, ComponentTypeDescription, Registry } from '../../odo/componentType';
import { Endpoint } from '../../odo/componentTypeDescription';
import OpenShiftItem from '../../openshift/openshiftItem';
import { ComponentTypesView } from '../../registriesView';
import { ExtensionID } from '../../util/constants';
import { selectWorkspaceFolder } from '../../util/workspace';
import { loadWebviewHtml } from '../common-ext/utils';
import { Devfile, DevfileRegistry } from '../common/devfile';
import { DevfileConverter } from '../git-import/devfileConverter';

type Message = {
    action: string;
    data: any;
}

export default class CreateComponentLoader {

    static panel: WebviewPanel;

    static get extensionPath() {
        return extensions.getExtension(ExtensionID).extensionPath
    }

    static async loadView(title: string): Promise<WebviewPanel> {
        const localResourceRoot = Uri.file(path.join(CreateComponentLoader.extensionPath, 'out', 'createComponentViewer'));

        let panel = window.createWebviewPanel('createComponentView', title, ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [localResourceRoot],
            retainContextWhenHidden: true
        });

        const messageHandlerDisposable = panel.webview.onDidReceiveMessage(CreateComponentLoader.messageHandler);

        const colorThemeDisposable = vscode.window.onDidChangeActiveColorTheme(async function (colorTheme: vscode.ColorTheme) {
            await panel.webview.postMessage({ action: 'setTheme', themeValue: colorTheme.kind });
        });

        panel.onDidDispose(() => {
            colorThemeDisposable.dispose();
            messageHandlerDisposable.dispose();
            panel = undefined;
        });

        panel.iconPath = Uri.file(path.join(CreateComponentLoader.extensionPath, 'images/context/cluster-node.png'));
        panel.webview.html = await loadWebviewHtml('createComponentViewer', panel);
        CreateComponentLoader.panel = panel;
        return panel;
    }

    /**
     * Respond to messages from the webview.
     */
    static async messageHandler(message: Message) {
        switch (message.action) {
            /**
             * The panel has successfully loaded. Send the kind of the current color theme to update the theme.
             */
            case 'init': {
                void CreateComponentLoader.panel.webview.postMessage({
                    action: 'setTheme',
                    themeValue: vscode.window.activeColorTheme.kind,
                });
                break;
            }
            /**
             * The panel requested the list of devfile registries with their devfiles. Respond with this list.
             */
            case 'getDevfileRegistries': {
                void CreateComponentLoader.panel.webview.postMessage({
                    action: 'devfileRegistries',
                    data: CreateComponentLoader.getDevfileRegistries()
                });
                break;
            }
            /**
             * The panel requested the list of workspace folders. Respond with this list.
             */
            case 'getWorkspaceFolders': {
                if (vscode.workspace.workspaceFolders !== undefined) {
                    let workspaceFolderUris: Uri[] = vscode.workspace.workspaceFolders.map(wsFolder => wsFolder.uri);
                    workspaceFolderUris.filter((uri) => !isDevfileExists(uri));
                    void CreateComponentLoader.panel.webview.postMessage({
                        action: 'workspaceFolders',
                        data: workspaceFolderUris
                    });
                }
                break;
            }
            /**
             * The panel requested to validate the entered component name. Respond with error status and message.
             */
            case 'validateComponentName': {
                CreateComponentLoader.validateComponentName(message.data);
                break;
            }
            case 'selectProjectFolder': {
                const workspaceUri: vscode.Uri = await selectWorkspaceFolder(true);
                const isDevfileExist: boolean = await isDevfileExists(workspaceUri);
                void CreateComponentLoader.panel.webview.postMessage({
                    action: 'devfileExists',
                    data: isDevfileExist
                });
                void CreateComponentLoader.panel.webview.postMessage({
                    action: 'workspaceFolders',
                    data: vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.map(wsFolder => wsFolder.uri) : [workspaceUri]
                });
                void CreateComponentLoader.panel.webview.postMessage({
                    action: 'selectedProjectFolder',
                    data: workspaceUri,
                });
                break;
            }
            case 'getRecommendedDevfile': {
                void CreateComponentLoader.panel.webview.postMessage({
                    action: 'devfileExists',
                    data: await isDevfileExists(Uri.file(message.data))
                });
                CreateComponentLoader.getRecommendedDevfile(Uri.file(message.data));
                break;
            }
        }
    }

    static getDevfileRegistries(): DevfileRegistry[] {
        const registries = ComponentTypesView.instance.getListOfRegistries();
        if (!registries || registries.length === 0) {
            throw new Error('No Devfile registries available. Default registry is missing');
        }
        const devfileRegistries = registries.map((registry: Registry) => {
            return {
                devfiles: [],
                name: registry.name,
                url: registry.url,
            } as DevfileRegistry;
        });

        const components = ComponentTypesView.instance.getCompDescriptions();
        for (const component of components) {
            const devfileRegistry = devfileRegistries.find((devfileRegistry) => devfileRegistry.url === component.registry.url.toString());
            devfileRegistry.devfiles.push({
                description: component.description,
                logoUrl: component.devfileData.devfile.metadata.icon,
                name: component.displayName,
                sampleProjects: component.starterProjects,
                tags: component.tags,
                yaml: YAML.stringify(component.devfileData.devfile),
                supportsDebug: Boolean(component.devfileData.devfile.commands?.find((command) => command.exec?.group?.kind === 'debug'))
                    || Boolean(component.devfileData.devfile.commands?.find((command) => command.composite?.group?.kind === 'debug')),
                supportsDeploy: Boolean(component.devfileData.devfile.commands?.find((command) => command.exec?.group?.kind === 'deploy'))
                    || Boolean(component.devfileData.devfile.commands?.find((command) => command.composite?.group?.kind === 'deploy'))
            } as Devfile);
        }
        devfileRegistries.sort((a, b) => a.name < b.name ? -1 : 1);
        return devfileRegistries;
    }

    static validateComponentName(data: string) {
        let validationMessage = OpenShiftItem.emptyName(`Please enter a component name.`, data);
        if (!validationMessage) validationMessage = OpenShiftItem.validateMatches(`Not a valid component name.
            Please use lower case alphanumeric characters or '-', start with an alphabetic character, and end with an alphanumeric character`, data);
        if (!validationMessage) validationMessage = OpenShiftItem.lengthName(`Component name should be between 2-63 characters`, data, 0);
        void CreateComponentLoader.panel.webview.postMessage({
            action: 'validatedComponentName',
            data: validationMessage,
        });
    }

    static async getRecommendedDevfile(uri: Uri) {
        let analyzeRes: AnalyzeResponse[] = [];
        let compDescriptions: ComponentTypeDescription[] = [];
        try {
            analyzeRes = await OdoImpl.Instance.analyze(uri.fsPath);
            compDescriptions = getCompDescription(analyzeRes);
        } catch (error) {
            if (error.message.toLowerCase().indexOf('failed to parse the devfile') !== -1) {
                CreateComponentLoader.panel?.webview.postMessage({
                    action: 'devfileFailed'
                });
                const actions: Array<string> = ['Yes', 'Cancel'];
                const devfileRegenerate = await vscode.window.showInformationMessage('We have detected that the repo contains configuration based on devfile v1. The extension does not support devfile v1, will you be okay to regenerate a new devfile v2?', ...actions);
                if (devfileRegenerate === 'Yes') {
                    try {
                        const devFileV1Path = path.join(uri.fsPath, 'devfile.yaml');
                        const file = fs.readFile(devFileV1Path, 'utf8');
                        const devfileV1 = YAML.parse(file.toString());
                        const deleted = await deleteFile(devFileV1Path);
                        if (deleted) {
                            analyzeRes = await OdoImpl.Instance.analyze(uri.fsPath);
                            compDescriptions = getCompDescription(analyzeRes);
                            const endPoints = getEndPoints(compDescriptions[0]);
                            const devfileV2 = await DevfileConverter.getInstance().devfileV1toDevfileV2(devfileV1, endPoints);
                            const yaml = YAML.stringify(devfileV2, { sortMapEntries: true });
                            fs.writeFile(devFileV1Path, yaml.toString(), 'utf-8');
                            CreateComponentLoader.panel?.webview.postMessage({
                                action: 'devfileRegenerated'
                            });
                        } else {
                            vscode.window.showErrorMessage('Failed to delete devfile.yaml, Unable to proceed the component creation');
                        }
                    } catch (e) {
                        vscode.window.showErrorMessage('Failed to parse devfile v1, Unable to proceed the component creation');
                    }
                } else {
                    vscode.window.showErrorMessage('Devfile version not supported, Unable to proceed the component creation');
                }
            } else {
                compDescriptions = getCompDescription(analyzeRes);
            }
        } finally {
            const devfileRegistry: DevfileRegistry[] = CreateComponentLoader.getDevfileRegistries();
            const devfile: Devfile = devfileRegistry[0].devfiles.find((devfile) => devfile.name === compDescriptions[0].displayName);
            void CreateComponentLoader.panel.webview.postMessage({
                action: 'recommendedDevfile',
                data: devfile
            });
        }
    }
}

function getCompDescription(devfiles: AnalyzeResponse[]): ComponentTypeDescription[] {
    const compDescriptions = ComponentTypesView.instance.getCompDescriptions();
    if (devfiles.length === 0) {
        return Array.from(compDescriptions);
    }
    return Array.from(compDescriptions).filter(({ name, version, registry }) => devfiles.some((res) => res.devfile === name &&
        res.devfileVersion === version && res.devfileRegistry === registry.name));
}

function deleteFile(file: string): Promise<boolean> {
    return new Promise<boolean>(function (resolve, _reject) {
        try {
            fs.unlink(file)
            resolve(true);
        } catch (err) {
            resolve(false);
        }
    });
};

function getEndPoints(compDescription: ComponentTypeDescription): Endpoint[] {
    return compDescription.devfileData.devfile.components[0].container.endpoints;
}

async function isDevfileExists(uri: vscode.Uri): Promise<boolean> {
    if ((await fs.stat(uri.fsPath)).isDirectory()) {
        const devFileYamlPath = path.join(uri.fsPath, 'devfile.yaml');
        try {
            await fs.access(devFileYamlPath);
            return true;
        } catch {
            return false;
        }
    }
}