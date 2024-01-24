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

describe('Extension public-facing UI tests', function() {
    const contextFolder = path.join(__dirname, 'context');
    const kubeConfig = path.join(process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'], '.kube', 'config');
    const kubeBackup = `${kubeConfig}.backup`;

    // test with an empty kube config, make a backup, wipe the context folder
    before(async function () {
        if (fs.existsSync(kubeConfig)) {
            console.log('kubeconfig exists')
            console.log(fs.readFileSync(kubeConfig));
            await fs.move(kubeConfig, kubeBackup, { overwrite: true });
            console.log(fs.readFileSync(kubeBackup));
        }
        console.log('check message')
        console.log(kubeConfig);
        await fs.emptyDir(contextFolder);
    });

    // restore the kube config backup after test
    after(async function () {
        if (fs.existsSync(kubeBackup)) {
            await fs.move(kubeBackup, kubeConfig, { overwrite: true });
        }
    });

    checkExtension();
    checkOpenshiftView();
    checkAboutCommand();
    testDevfileRegistries();
    checkFocusOnCommands();
    testCreateComponent(contextFolder);
    testCreateServerlessFunction(contextFolder);
});
