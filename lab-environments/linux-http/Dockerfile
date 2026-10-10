FROM python:3.13-slim
RUN groupadd --gid 10001 learner && useradd --uid 10001 --gid learner --create-home learner
WORKDIR /lab
COPY --chown=learner:learner server.py control.py /lab/
USER learner
CMD ["python", "/lab/server.py"]
