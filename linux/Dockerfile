# Derived from the user's SynthAi 5.8 Dockerfile.hover (pinned in lineage).
# Same Alpine/Node host; original maker code and Fantastic4 glue are the payload.
FROM node:22-alpine3.22
RUN apk add --no-cache ca-certificates tzdata
COPY runtime /opt/fantastic4
RUN mkdir -p /var/lib/synthai /root /tmp \
    && node --check /opt/fantastic4/server.mjs \
    && node --test /opt/fantastic4/test/*.test.mjs
WORKDIR /opt/fantastic4
ENV PORT=4183
ENV SYNTHIA_DATA_DIR=/var/lib/synthai
CMD ["node", "/opt/fantastic4/server.mjs"]
