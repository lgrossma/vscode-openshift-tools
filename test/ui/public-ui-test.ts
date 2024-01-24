/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

import { checkAboutCommand } from './suite/command-about';
import path = require('path');
import * as fs from 'fs-extra';
import { testCreateComponent } from './suite/createComponent';
import { testDevfileRegistries } from './suite/devfileRegistries';
import { checkExtension } from './suite/extension';
import { checkFocusOnCommands } from './suite/focusOn';
import { checkOpenshiftView } from './suite/openshift';
import { testCreateServerlessFunction } from './suite/serverlessFunction';

require('source-map-support').install();

describe('Extension public-facing UI tests', async function() {
    const contextFolder = path.join(__dirname, 'context');
    const kubeConfig = path.join(process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'], '.kube', 'config');
    const kubeBackup = `${kubeConfig}.backup`;

    // test with an empty kube config, make a backup, wipe the context folder
    before(async function () {
       await checkConfig(kubeConfig, kubeBackup);
    });

    await checkConfig(kubeConfig, kubeBackup);
    checkExtension();
    await checkConfig(kubeConfig, kubeBackup);
    checkOpenshiftView();
    await checkConfig(kubeConfig, kubeBackup);
    checkAboutCommand();
    await checkConfig(kubeConfig, kubeBackup);
    testDevfileRegistries();
    await checkConfig(kubeConfig, kubeBackup);
    checkFocusOnCommands();
    await checkConfig(kubeConfig, kubeBackup);
    testCreateComponent(contextFolder);
    await checkConfig(kubeConfig, kubeBackup);
    testCreateServerlessFunction(contextFolder);
    await checkConfig(kubeConfig, kubeBackup);
});

async function checkConfig(kubeConfig, kubeBackup){
    if (fs.existsSync(kubeConfig)) {
        console.log('kubeconfig exists')
        console.log(fs.readFileSync(kubeConfig));
        await fs.move(kubeConfig, kubeBackup, { overwrite: true });
    }
    console.log('check message')
    console.log(kubeConfig);
}
