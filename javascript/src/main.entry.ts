import { html, LitElement } from 'lit'
import { customElement } from 'lit/decorators.js'
import { until } from 'lit/directives/until.js';
import { WorkerApi } from './client_worker';

const worker: WorkerApi = new WorkerApi();
console.log(worker);

@customElement("test-el")
class TestEl extends LitElement {
    render() {
        return html`<h1>Hello, World ..... ${until(worker.sum(111, 5))}</h1>`;
    }
}

