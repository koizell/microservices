"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const supertest_1 = require("supertest");
const app_module_1 = require("./../src/app.module");
describe('TicketController (e2e)', () => {
    let app;
    beforeEach(async () => {
        const moduleFixture = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
    });
    it('/tickets (GET)', () => {
        return (0, supertest_1.default)(app.getHttpServer())
            .get('/tickets')
            .expect(200)
            .expect('Lista de tickets');
    });
});
//# sourceMappingURL=app.e2e-spec.js.map