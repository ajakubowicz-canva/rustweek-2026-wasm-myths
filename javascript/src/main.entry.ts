import { html, LitElement } from 'lit'
import { customElement } from 'lit/decorators.js'
import { until } from 'lit/directives/until.js';
import { WorkerApi } from './client_worker';

// Register graph viewer component.
import "./core/benchmark-graph-viewer.js";

const worker: WorkerApi = new WorkerApi();

// TODO: Temporary – to be replaced by an actual UI usage.
worker.runBenchmarks([
    { id: 'bench-monomorphic', N: 100_000 },
    { id: 'bench-megamorphic', N: 100_000 },
]).then(results => console.log(results));

@customElement("test-el")
class TestEl extends LitElement {
    render() {
        return html`<h1>Hello, World ..... ${until(worker.sum(111, 5))}</h1>`;
    }
}

