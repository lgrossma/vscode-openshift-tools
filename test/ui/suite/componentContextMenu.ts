/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

import { ActivityBar, EditorView, SideBarView, ViewItem, ViewSection } from 'vscode-extension-tester';
import { collapse } from '../common/overdrives';
import { MENUS, VIEWS } from '../common/constants';

export function testComponentContextMenu() {
    describe('Component Context Menu', function () {
        let view: SideBarView;
        let section: ViewSection;
        let component: ViewItem;
        
        const componentName = 'nodejs-starter';

        before(async function context() {
            this.timeout(10_000);
            await new EditorView().closeAllEditors();
            view = await (await new ActivityBar().getViewControl(VIEWS.openshift)).openView();
            for (const item of [
                VIEWS.appExplorer,
                VIEWS.compRegistries,
                VIEWS.serverlessFunctions,
                VIEWS.debugSessions,
            ]) {
                await collapse(await view.getContent().getSection(item));
            }
            
            section = await view.getContent().getSection(VIEWS.components);
        });

        it('Start Dev works', async function () {
            component = await section.findItem(componentName);
            let contextMenu = await component.openContextMenu();
            await contextMenu.select(MENUS.startDev);
        });

        it('Stop Dev works', async function () {

        })
    });
}